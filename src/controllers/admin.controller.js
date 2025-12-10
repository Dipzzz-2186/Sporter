// src/controllers/admin.controller.js
const db = require("../config/db");
const bcrypt = require("bcryptjs"); // lebih stabil di Windows/dev
const SALT_ROUNDS = 12;

/**
 * Render admin dashboard
 */
exports.renderDashboard = async (req, res) => {
  try {
    // counts
    const [sportsRows] = await db.query("SELECT COUNT(*) AS total FROM sports");
    const sportsCount = sportsRows[0] ? sportsRows[0].total : 0;

    const [eventsRows] = await db.query("SELECT COUNT(*) AS total FROM events");
    const eventsCount = eventsRows[0] ? eventsRows[0].total : 0;

    const [upcomingRows] = await db.query(
      "SELECT COUNT(*) AS total FROM events WHERE status = 'upcoming'"
    );
    const upcomingEventsCount = upcomingRows[0] ? upcomingRows[0].total : 0;

    const [newsRows] = await db.query(
      "SELECT COUNT(*) AS total FROM news_articles WHERE status = 'published'"
    );
    const newsCount = newsRows[0] ? newsRows[0].total : 0;

    // orders maybe not exist — safe try/catch
    let ordersCount = 0;
    try {
      const [ordersRows] = await db.query("SELECT COUNT(*) AS total FROM orders");
      ordersCount = ordersRows[0] ? ordersRows[0].total : 0;
    } catch (e) {
      ordersCount = 0;
    }

    // recent events
    const [recentEvents] = await db.query(
      `SELECT e.id, e.title, e.slug, e.start_date, e.status, s.name AS sport_name
       FROM events e
       LEFT JOIN sports s ON s.id = e.sport_id
       ORDER BY e.start_date DESC
       LIMIT 5`
    );

    // recent news
    const [recentNews] = await db.query(
      `SELECT n.id, n.title, n.slug, n.published_at, sp.name AS sport_name
       FROM news_articles n
       LEFT JOIN sports sp ON sp.id = n.sport_id
       WHERE n.status = 'published'
       ORDER BY n.published_at DESC
       LIMIT 5`
    );

    return res.render("admin/dashboard", {
      title: "Admin Dashboard - SPORTER",
      stats: {
        sports: sportsCount,
        events: eventsCount,
        upcomingEvents: upcomingEventsCount,
        news: newsCount,
        orders: ordersCount,
      },
      recentEvents,
      recentNews,
    });
  } catch (err) {
    console.error("ERROR renderDashboard:", err);
    return res.status(500).send("Terjadi kesalahan saat memuat dashboard.");
  }
};

/**
 * Render form to create subadmin
 */
exports.renderCreateSubadmin = async (req, res) => {
  try {
    const [sports] = await db.query("SELECT id, name FROM sports ORDER BY name");
    return res.render("admin/create_subadmin", { title: "Buat SubAdmin - SPORTER", sports });
  } catch (err) {
    console.error("ERROR renderCreateSubadmin:", err);
    req.flash("error", "Gagal memuat form.");
    return res.redirect("/admin");
  }
};

/**
 * Create subadmin and assign sports
 */
exports.createSubadmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let sport_ids = req.body.sport_ids || [];

    if (!name || !email || !password) {
      req.flash("error", "Nama, email, dan password wajib diisi.");
      return res.redirect("/admin/subadmins/create");
    }

    // normalize sport_ids -> array of numbers
    if (!Array.isArray(sport_ids)) {
      if (typeof sport_ids === "string" && sport_ids.trim() !== "") {
        sport_ids = sport_ids.split(",").map((s) => s.trim());
      } else {
        sport_ids = [];
      }
    }
    sport_ids = sport_ids.map((s) => Number(s)).filter(Boolean);

    // cek email exists
    const [exists] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (exists.length > 0) {
      req.flash("error", "Email sudah digunakan.");
      return res.redirect("/admin/subadmins/create");
    }

    // hash password (synchronous - fine for admin creation)
    const hash = bcrypt.hashSync(password, SALT_ROUNDS);

    const insertUserSql =
      "INSERT INTO users (name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'subadmin', NOW(), NOW())";
    const [ins] = await db.query(insertUserSql, [name, email, hash]);
    const subadminId = ins.insertId;

    if (sport_ids.length) {
      const values = sport_ids.map((sid) => [subadminId, sid, req.session.user ? req.session.user.id : null]);
      // note: mysql2 supports bulk insert with VALUES ?
      await db.query("INSERT INTO user_sports (user_id, sport_id, assigned_by) VALUES ?", [values]);
    }

    req.flash("success", "SubAdmin berhasil dibuat.");
    return res.redirect("/admin/subadmins");
  } catch (err) {
    console.error("ERROR createSubadmin:", err);
    req.flash("error", "Gagal membuat SubAdmin.");
    return res.redirect("/admin/subadmins/create");
  }
};

/**
 * List subadmins
 */
exports.listSubadmins = async (req, res) => {
  try {
    const [subs] = await db.query(`
      SELECT u.id, u.name, u.email, u.created_at,
        GROUP_CONCAT(s.name SEPARATOR ', ') AS sports
      FROM users u
      LEFT JOIN user_sports us ON us.user_id = u.id
      LEFT JOIN sports s ON s.id = us.sport_id
      WHERE u.role = 'subadmin'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return res.render("admin/subadmins", { title: "Manage SubAdmin - SPORTER", subadmins: subs });
  } catch (err) {
    console.error("ERROR listSubadmins:", err);
    req.flash("error", "Gagal memuat data SubAdmin.");
    return res.redirect("/admin");
  }
};

/**
 * Delete subadmin
 */
exports.deleteSubadmin = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID tidak valid.");
      return res.redirect("/admin/subadmins");
    }
    await db.query("DELETE FROM users WHERE id = ? AND role = 'subadmin'", [id]);
    req.flash("success", "SubAdmin dihapus.");
    return res.redirect("/admin/subadmins");
  } catch (err) {
    console.error("ERROR deleteSubadmin:", err);
    req.flash("error", "Gagal menghapus SubAdmin.");
    return res.redirect("/admin/subadmins");
  }
};
