// src/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");

const getSafeNextUrl = (rawNext) => {
  if (!rawNext || typeof rawNext !== "string") return "/";
  if (rawNext.startsWith("/")) return rawNext;
  return "/";
};

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
    if (req.session.user.role === "seller") {
      return res.redirect("/seller");
    }
    if (req.session.user.role === "athlete") {
      return res.redirect("/profile");
    }
    const safeNext = getSafeNextUrl(req.query.next);
    return res.redirect(safeNext || "/");
  }

  // Jika belum login, tampilkan form login
  res.render("auth/login", {
    title: "Login - SPORTER",
    old: { email: req.query.email || "" },
    next: req.query.next || "",
  });
};

// ===========================
// POST /login
// ===========================
exports.handleLogin = async (req, res) => {
  const { email, password } = req.body;
  const identifier = String(email || "").trim();

  if (!identifier || !password) {
    req.flash("error", "Email dan password wajib diisi.");
    return res.redirect("/login");
  }

  try {
    let user = await User.getByEmail(identifier);
    if (!user) {
      user = await User.getByAthleteName(identifier);
    }

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
      athlete_id: user.athlete_id || null,
    };

    req.flash("success", `Selamat datang, ${user.name || user.email}!`);

    // Redirect berdasarkan role
    if (user.role === "admin") {
      return res.redirect("/admin");
    }

    if (user.role === "subadmin") {
      return res.redirect("/subadmin");
    }

    if (user.role === "seller") {
      return res.redirect("/seller");
    }
    if (user.role === "athlete") {
      return res.redirect("/profile");
    }

    // user biasa
    const nextRaw = req.body.next || req.query.next;
    const nextUrl = getSafeNextUrl(nextRaw);
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
    title: "Register - SPORTS",
    old: {
      name: req.query.name || "",
      email: req.query.email || "",
    },
    next: req.query.next || "",
  });
};

// POST /register
exports.handleRegister = async (req, res) => {
  const { name, email, password, confirm_password } = req.body;
  const nextRaw = req.body.next || req.query.next;
  const nextUrl = getSafeNextUrl(nextRaw);
  const nextQuery = nextUrl && nextUrl !== "/" ? `&next=${encodeURIComponent(nextUrl)}` : "";

  if (!name || !email || !password || !confirm_password) {
    req.flash("error", "Semua field wajib diisi.");
    return res.redirect(`/register?name=${encodeURIComponent(name || "")}&email=${encodeURIComponent(email || "")}${nextQuery}`);
  }

  if (password.length < 6) {
    req.flash("error", "Password minimal 6 karakter.");
    return res.redirect(`/register?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}${nextQuery}`);
  }

  if (password !== confirm_password) {
    req.flash("error", "Konfirmasi password tidak sama.");
    return res.redirect(`/register?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}${nextQuery}`);
  }

  try {
    const existing = await User.getByEmail(email);
    if (existing) {
      req.flash("error", "Email sudah terdaftar. Silakan login.");
      return res.redirect(`/register?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}${nextQuery}`);
    }

    const password_hash = await bcrypt.hash(password, 10);

    await User.createUser({ name, email, password_hash, role: "user" });

    req.flash("success", "Register berhasil. Silakan login.");
    return res.redirect(`/login?email=${encodeURIComponent(email)}${nextQuery}`);
  } catch (err) {
    console.error("Register error:", err);
    req.flash("error", "Terjadi kesalahan server.");
    return res.redirect(`/register?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}${nextQuery}`);
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
