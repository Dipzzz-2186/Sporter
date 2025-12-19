const db = require('../config/db');

function getCurrentUser(req, res) {
  return (
    req.user ||
    res.locals.currentUser ||
    (req.session && (req.session.user || req.session.currentUser)) ||
    null
  );
}

// ✅ TOGGLE FAVORITE (WAJIB ADA)
exports.toggleFavorite = async (req, res) => {
  try {
    const currentUser = getCurrentUser(req, res);
    if (!currentUser) {
      return res.status(401).json({ ok: false });
    }

    const userId = currentUser.id;
    const { entityType, entityId } = req.body;

    if (!entityType || !entityId) {
      return res.status(400).json({ ok: false, message: 'Invalid payload' });
    }

    const [exist] = await db.query(
      'SELECT id FROM user_favorites WHERE user_id=? AND entity_type=? AND entity_id=? LIMIT 1',
      [userId, entityType, entityId]
    );

    if (exist.length) {
      await db.query(
        'DELETE FROM user_favorites WHERE user_id=? AND entity_type=? AND entity_id=?',
        [userId, entityType, entityId]
      );
      return res.json({ ok: true, favorited: false });
    } else {
      await db.query(
        'INSERT INTO user_favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?)',
        [userId, entityType, entityId]
      );
      return res.json({ ok: true, favorited: true });
    }
  } catch (err) {
    console.error('toggleFavorite error:', err);
    return res.status(500).json({ ok: false });
  }
};

// ✅ HALAMAN FAVORITES
exports.myFavoritesPage = async (req, res) => {
  try {
    const currentUser = getCurrentUser(req, res);
    if (!currentUser) return res.redirect('/login');

    const userId = currentUser.id;

    const [items] = await db.query(
      `
      SELECT
        uf.id AS favorite_id,
        uf.created_at AS favorited_at,
        e.id AS event_id,
        e.title,
        e.slug,
        e.status,
        e.start_date,
        e.end_date
      FROM user_favorites uf
      JOIN events e ON e.id = uf.entity_id
      WHERE uf.user_id = ? AND uf.entity_type = 'event'
      ORDER BY uf.created_at DESC
      `,
      [userId]
    );

    // format tanggal biar view ga ribet & aman
    const formatted = items.map(it => ({
      ...it,
      start_date_formatted: it.start_date
        ? new Date(it.start_date).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })
        : null,
      end_date_formatted: it.end_date
        ? new Date(it.end_date).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })
        : null,
      favorited_at_formatted: it.favorited_at
        ? new Date(it.favorited_at).toLocaleString('id-ID')
        : null
    }));

    return res.render('favorites/index', {
      title: 'Disimpan (Favorites)',
      items: formatted
    });
  } catch (err) {
    console.error('myFavoritesPage error:', err); // <— ini bakal ngasih detail kalau masih error
    return res.status(500).send('Server error');
  }
};

