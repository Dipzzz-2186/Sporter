const bcrypt = require('bcrypt');
const db = require('../config/db'); // sesuaikan kalau db path beda

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

  res.render('profile/index', {
    title: 'Profile',
    user: currentUser,
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
