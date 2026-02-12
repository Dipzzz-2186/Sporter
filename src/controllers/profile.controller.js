const bcrypt = require('bcrypt');
const db = require('../config/db'); // sesuaikan kalau db path beda
const athleteModel = require('../models/athlete.model');

function getCurrentUser(req, res) {
  return (
    req.user ||
    res.locals.currentUser ||
    (req.session && (req.session.user || req.session.currentUser)) ||
    null
  );
}

exports.profilePage = async (req, res) => {
  const currentUser = getCurrentUser(req, res);
  if (!currentUser) return res.redirect('/login');

  let athlete = null;
  if (currentUser.role === 'athlete' && currentUser.athlete_id) {
    athlete = await athleteModel.findById(currentUser.athlete_id);
  }

  res.render('profile/index', {
    title: 'Profile',
    user: currentUser,
    athlete,
    query: req.query || {},
    messages: {
      error: req.flash ? req.flash('error') : null,
      success: req.flash ? req.flash('success') : null
    }
  });
};

// ✅ GET halaman ganti password
exports.passwordPage = (req, res) => {
  const currentUser = getCurrentUser(req, res);
  if (!currentUser) return res.redirect('/login');

  res.render('profile/password', {
    title: 'Ganti Password',
    user: currentUser,
    query: req.query || {},
    messages: {
      error: req.flash ? req.flash('error') : null,
      success: req.flash ? req.flash('success') : null
    }
  });
};

// ✅ POST ganti password
exports.updatePassword = async (req, res) => {
  try {
    const currentUser = getCurrentUser(req, res);
    if (!currentUser) return res.redirect('/login');

    const userId = currentUser.id;
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      req.flash('error', 'Semua field wajib diisi.');
      return res.redirect('/profile/password');
    }
    if (new_password.length < 6) {
      req.flash('error', 'Password baru minimal 6 karakter.');
      return res.redirect('/profile/password');
    }
    if (new_password !== confirm_password) {
      req.flash('error', 'Konfirmasi password tidak sama.');
      return res.redirect('/profile/password');
    }

    const [rows] = await db.query(
      'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!rows || rows.length === 0) {
      req.flash('error', 'User tidak ditemukan.');
      return res.redirect('/profile/password');
    }

    const hashed = rows[0].password_hash; // ✅ FIX DI SINI
    if (!hashed) {
      req.flash('error', 'Password user belum terset (password_hash kosong).');
      return res.redirect('/profile/password');
    }

    const ok = await bcrypt.compare(current_password, hashed);
    if (!ok) {
      req.flash('error', 'Password saat ini salah.');
      return res.redirect('/profile/password');
    }

    const newHash = await bcrypt.hash(new_password, 10);

    await db.query(
      'UPDATE users SET password_hash = ? WHERE id = ?', // ✅ FIX DI SINI
      [newHash, userId]
    );

    req.flash('success', 'Password berhasil diganti.');
    return res.redirect('/profile');
  } catch (err) {
    console.error('updatePassword error:', err);
    req.flash('error', 'Terjadi kesalahan server.');
    return res.redirect('/profile/password');
  }
};
// ✅ GET tiket milik user (group per match)
exports.myTicketsPage = async (req, res) => {
  const currentUser = getCurrentUser(req, res);
  if (!currentUser) return res.redirect('/login');

  const userId = currentUser.id;

  const [rows] = await db.query(`
    SELECT
      m.id AS match_id,
      m.title AS match_title,
      m.start_time,
      t.id AS ticket_id,
      t.ticket_code,
      t.holder_name,
      t.holder_phone, 
      tt.price
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN tickets t       ON t.order_item_id = oi.id
    JOIN ticket_types tt ON tt.id = oi.ticket_type_id
    JOIN matches m       ON m.id = tt.match_id
    WHERE o.user_id = ?
      AND t.holder_name IS NOT NULL
      AND t.holder_name <> ''
    ORDER BY m.start_time DESC, t.id ASC
  `, [userId]);

  res.render('profile/my-tickets', {
    title: 'Tiket Saya',
    user: currentUser,
    rows,
    messages: {
      error: req.flash ? req.flash('error') : null,
      success: req.flash ? req.flash('success') : null
    }
  });
};

exports.updateAthleteProfile = async (req, res) => {
  const currentUser = getCurrentUser(req, res);
  if (!currentUser) return res.redirect('/login');
  if (currentUser.role !== 'athlete' || !currentUser.athlete_id) {
    req.flash('error', 'Akses ditolak.');
    return res.redirect('/profile');
  }

  try {
    const athleteId = currentUser.athlete_id;
    const payload = {
      name: (req.body.name || '').trim(),
      country_code: (req.body.country_code || '').trim() || null,
      playing_position: (req.body.playing_position || '').trim() || null,
      coach: (req.body.coach || '').trim() || null,
      born_in: (req.body.born_in || '').trim() || null,
      height_cm: req.body.height_cm ? Number(req.body.height_cm) : null,
      bio: (req.body.bio || '').trim() || null,
      titles: req.body.titles ? Number(req.body.titles) : 0,
      race: (req.body.race || '').trim() || null,
      best_rank: (req.body.best_rank || '').trim() || null,
    };

    if (!payload.name) {
      req.flash('error', 'Nama wajib diisi.');
      return res.redirect('/profile');
    }

    if (req.file) {
      payload.photo_url = `/uploads/athletes/${req.file.filename}`;
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const fields = [];
      const values = [];
      for (const [k, v] of Object.entries(payload)) {
        fields.push(`${k} = ?`);
        values.push(v);
      }
      values.push(athleteId);
      await conn.query(`UPDATE athletes SET ${fields.join(', ')} WHERE id = ?`, values);

      await conn.query(
        'UPDATE users SET name = ?, updated_at = NOW() WHERE id = ?',
        [payload.name, currentUser.id]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    req.session.user.name = payload.name;
    req.flash('success', 'Profil athlete berhasil diperbarui.');
    return res.redirect('/profile');
  } catch (err) {
    console.error('updateAthleteProfile error:', err);
    req.flash('error', 'Gagal memperbarui profil athlete.');
    return res.redirect('/profile');
  }
};
