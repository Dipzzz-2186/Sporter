// src/middlewares/authorize.middleware.js
const db = require('../config/db');

exports.requireAssignedToSport = (paramSportIdGetter) => {
  return async (req, res, next) => {
    try {
      // admin bypass
      if (req.session.user && req.session.user.role === 'admin') return next();
      if (!req.session.user) {
        return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      }
      const role = req.session.user.role;
      if (role !== 'subadmin') {
        req.flash('error', 'Akses ditolak.');
        return res.redirect('/');
      }

      // support async or sync getter
      let sportId = paramSportIdGetter && paramSportIdGetter(req);
      if (sportId && typeof sportId.then === 'function') {
        sportId = await sportId;
      }

      if (!sportId) {
        req.flash('error', 'Sport ID tidak valid.');
        return res.redirect('back');
      }

      const [rows] = await db.query(
        'SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1',
        [req.session.user.id, sportId]
      );
      if (rows.length === 0) {
        req.flash('error', 'Anda tidak memiliki akses ke cabang olahraga ini.');
        return res.redirect('/');
      }
      return next();
    } catch (err) {
      console.error('requireAssignedToSport error', err);
      req.flash('error', 'Server error.');
      return res.redirect('/');
    }
  };
};
