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


// GET /register
exports.renderRegister = (req, res) => {
  // kalau sudah login, jangan register lagi
  if (req.session.user) return res.redirect("/");

  res.render("auth/register", {
    title: "Register - SPORTER",
    old: {
      name: req.query.name || "",
      email: req.query.email || "",
    },
  });
};

// POST /register
exports.handleRegister = async (req, res) => {
  const { name, email, password, confirm_password } = req.body;

  if (!name || !email || !password || !confirm_password) {
    req.flash("error", "Semua field wajib diisi.");
    return res.redirect(`/register?name=${encodeURIComponent(name||"")}&email=${encodeURIComponent(email||"")}`);
  }

  if (password.length < 6) {
    req.flash("error", "Password minimal 6 karakter.");
    return res.redirect(`/register?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`);
  }

  if (password !== confirm_password) {
    req.flash("error", "Konfirmasi password tidak sama.");
    return res.redirect(`/register?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`);
  }

  try {
    const existing = await User.getByEmail(email);
    if (existing) {
      req.flash("error", "Email sudah terdaftar. Silakan login.");
      return res.redirect(`/register?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`);
    }

    const password_hash = await bcrypt.hash(password, 10);

    // role default user (biar aman)
    await User.createUser({ name, email, password_hash, role: "user" });

    req.flash("success", "Register berhasil. Silakan login.");
    return res.redirect(`/login?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error("Register error:", err);
    req.flash("error", "Terjadi kesalahan server.");
    return res.redirect(`/register?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`);
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
