// src/middlewares/auth.middleware.js

// Pastikan ada session dan user
const isLoggedIn = (req) => !!(req && req.session && req.session.user);

// Redirect ke login sambil menyertakan next param
const redirectToLogin = (req, res) => {
  const nextUrl = encodeURIComponent(req.originalUrl || "/");
  return res.redirect(`/login?next=${nextUrl}`);
};

// -------------------------
// middleware exports
// -------------------------

// Harus login (general)
exports.requireLogin = (req, res, next) => {
  if (!isLoggedIn(req)) return redirectToLogin(req, res);
  next();
};

// Hanya admin
exports.requireAdmin = (req, res, next) => {
  if (!isLoggedIn(req)) return redirectToLogin(req, res);
  if (req.session.user.role !== "admin") {
    req.flash("error", "Akses ditolak: khusus admin.");
    return res.redirect("/"); // jangan redirect ke /admin (bisa loop). Kirim ke homepage.
  }
  next();
};

// Admin atau Subadmin
exports.requireAdminOrSubadmin = (req, res, next) => {
  if (!isLoggedIn(req)) return redirectToLogin(req, res);
  const role = req.session.user.role;
  if (role === "admin" || role === "subadmin") return next();
  req.flash("error", "Akses ditolak: khusus admin / subadmin.");
  return res.redirect("/"); // arahkan pulang
};
