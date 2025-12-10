// middlewares/authRequired.js
module.exports = function authRequired(req, res, next) {
  if (!req.user) {
    // kalau belum login, redirect ke login dan simpan redirect URL
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
};
