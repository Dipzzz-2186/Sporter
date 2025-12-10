// src/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");

// GET /login
exports.renderLogin = (req, res) => {
  if (req.session.user) {
    // kalau sudah login, langsung ke home (atau dashboard admin)
    return res.redirect("/");
  }

  res.render("auth/login", {
    title: "Login - SPORTER",
    old: { email: req.query.email || "" },
  });
};

// POST /login
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

    // kalau sekarang password masih plain text di DB:
    // const passwordMatch = password === user.password_hash;

    // versi benar (hash bcrypt):
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      req.flash("error", "Email atau password salah.");
      return res.redirect("/login");
    }

    // Simpan user ke session (hanya data penting)
    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    req.flash("success", `Selamat datang, ${user.role}!`);

    // redirect ke halaman yang diminta sebelumnya (next=...)
    const nextUrl = req.query.next || "/";
    res.redirect(nextUrl);
  } catch (err) {
    console.error("Login error:", err);
    req.flash("error", "Terjadi kesalahan server.");
    res.redirect("/login");
  }
};

// GET /logout
exports.handleLogout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};
