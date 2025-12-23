const db = require('../config/db');

async function loadAllowedSports(req, res, next) {
  try {
    // default biar view aman
    req.allowedSports = [];
    res.locals.allowedSports = [];
    res.locals.allowedSportIds = [];

    // ambil semua sports untuk footer (global)
    const [allSports] = await db.query(
      `SELECT id, name, slug
       FROM sports
       ORDER BY name ASC`
    );
    res.locals.allSports = allSports || []; // <- ini buat footer global kalau mau

    // kalau belum login, cukup allSports aja
    if (!req.session.user) return next();

    // ADMIN: boleh semua sports
    if (req.session.user.role === 'admin') {
      req.allowedSports = allSports.map(s => s.id);
      res.locals.allowedSportIds = req.allowedSports;
      res.locals.allowedSports = allSports; // full objects
      return next();
    }

    // user biasa: ambil sport_id dari user_sports
    const [rows] = await db.query(
      'SELECT sport_id FROM user_sports WHERE user_id = ?',
      [req.session.user.id]
    );
    const ids = rows.map(r => r.sport_id);

    req.allowedSports = ids;
    res.locals.allowedSportIds = ids;

    // ambil detail sport-nya biar bisa dipakai di pug (name/slug)
    if (ids.length) {
      const [sports] = await db.query(
        `SELECT id, name, slug
         FROM sports
         WHERE id IN (?)
         ORDER BY name ASC`,
        [ids]
      );
      res.locals.allowedSports = sports || [];
    } else {
      res.locals.allowedSports = [];
    }

    return next();
  } catch (e) {
    console.error('loadAllowedSports', e.message);
    req.allowedSports = [];
    res.locals.allowedSportIds = [];
    res.locals.allowedSports = [];
    res.locals.allSports = res.locals.allSports || [];
    return next();
  }
}

module.exports = loadAllowedSports;
