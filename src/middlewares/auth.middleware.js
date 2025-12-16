// src/middlewares/auth.middleware.js

// helper
const isLoggedIn = (req) => !!(req && req.session && req.session.user);
const redirectToLogin = (req, res) => {
  const nextUrl = encodeURIComponent(req.originalUrl || "/");
  return res.redirect(`/login?next=${nextUrl}`);
};

// middlewares
function requireLogin(req, res, next) {
  if (isLoggedIn(req)) return next();
  req.flash && req.flash('error', 'Silakan login terlebih dahulu.');
  return redirectToLogin(req, res);
}

function requireAdmin(req, res, next) {
  if (!isLoggedIn(req)) return redirectToLogin(req, res);
  if (req.session.user.role === 'admin') return next();
  req.flash && req.flash('error', 'Akses ditolak: khusus admin.');
  // redirect aman ke homepage agar tidak loop jika admin-only area gagal
  return res.redirect('/');
}

function requireSubadmin(req, res, next) {
  if (!isLoggedIn(req)) return redirectToLogin(req, res);
  if (req.session.user.role === 'subadmin') return next();
  // kalau admin coba masuk area subadmin, redirect ke /admin supaya UX konsisten
  if (req.session.user.role === 'admin') return res.redirect('/admin');
  req.flash && req.flash('error', 'Akses ditolak: khusus subadmin.');
  return res.redirect('/');
}

function requireAdminOrSubadmin(req, res, next) {
  if (!isLoggedIn(req)) return redirectToLogin(req, res);
  const role = req.session.user.role;
  if (role === 'admin' || role === 'subadmin') return next();
  req.flash && req.flash('error', 'Akses ditolak.');
  return res.redirect('/');
}

function requireSeller(req, res, next) {
  if (!isLoggedIn(req)) return redirectToLogin(req, res);
  if (!req.session.user || req.session.user.role !== 'seller') {
    return res.redirect('/login');
  }
  next();
}

function requireAdminOrSeller(req, res, next) {
  if (!isLoggedIn(req)) return redirectToLogin(req, res);
  const role = req.session.user.role;
  if (role === 'admin' || role === 'seller') return next();
  req.flash && req.flash('error', 'Akses ditolak.');
  return res.redirect('/');
}

function requireUser(req, res, next) {
  if (!req.session.user || req.session.user.role !== "user") {
    return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  }
  next();
};
// export secara konsisten
module.exports = {
  requireLogin,
  requireAdmin,
  requireSubadmin,
  requireSeller,
  requireAdminOrSeller,
  requireUser,
  requireAdminOrSubadmin,
};
