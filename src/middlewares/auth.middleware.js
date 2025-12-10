// src/middlewares/auth.middleware.js

// Harus login
exports.requireLogin = (req, res, next) => {
  if (!req.session.user) {
    const nextUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?next=${nextUrl}`);
  }
  next();
};

// Hanya admin
exports.requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    const nextUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?next=${nextUrl}`);
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).send("Akses ditolak: khusus admin.");
  }
  next();
};

// Admin atau subadmin
exports.requireAdminOrSubadmin = (req, res, next) => {
  if (!req.session.user) {
    const nextUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?next=${nextUrl}`);
  }
  const role = req.session.user.role;
  if (role !== "admin" && role !== "subadmin") {
    return res.status(403).send("Akses ditolak: khusus admin / subadmin.");
  }
  next();
};
