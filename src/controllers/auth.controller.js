// src/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");

// ===========================
// GET /login
// ===========================
exports.renderLogin = (req, res) => {
  // Jika sudah login, langsung redirect sesuai role
  if (req.session.user) {
    if (req.session.user.role === "admin") {
      return res.redirect("/admin");
    }
    if (req.session.user.role === "subadmin") {
      return res.redirect("/subadmin");
    }
    return res.redirect("/");
  }

  // Jika belum login, tampilkan form login
  res.render("auth/login", {
    title: "Login - SPORTER",
    old: { email: req.query.email || "" },
  });
};

// ===========================
// POST /login
// ===========================
exports.handleLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    req.flash("error", "Email dan password wajib diisi.");
    return res.redirect("/login");
  }

  try {
    const user = await User.getByEmail(email);

    if (!user) {
      req.flash("error", "Email atau password salah.");
      return res.redirect("/login");
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      req.flash("error", "Email atau password salah.");
      return res.redirect("/login");
    }

    // Simpan session
    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name || null,
    };

    req.flash("success", `Selamat datang, ${user.name || user.email}!`);

    // Redirect berdasarkan role
    if (user.role === "admin") {
      return res.redirect("/admin");
    }

    if (user.role === "subadmin") {
      return res.redirect("/subadmin");
    }

    // USER BIASA
    const nextUrl = req.query.next || "/";
    return res.redirect(nextUrl);

  } catch (err) {
    console.error("Login error:", err);
    req.flash("error", "Terjadi kesalahan server.");
    return res.redirect("/login");
  }
};

// ===========================
// GET /logout
// ===========================
exports.handleLogout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};
