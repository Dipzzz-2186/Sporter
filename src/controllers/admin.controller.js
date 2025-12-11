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
// ========== EVENTS CRUD (ADMIN) ==========

// List semua event untuk halaman admin
exports.listEvents = async (req, res) => {
  try {
    const [events] = await db.query(
      `SELECT e.id, e.title, e.slug, e.start_date, e.end_date, e.status,
              s.name AS sport_name,
              v.name AS venue_name
       FROM events e
       LEFT JOIN sports s ON s.id = e.sport_id
       LEFT JOIN venues v ON v.id = e.venue_id
       ORDER BY e.start_date DESC`
    );

    return res.render("admin/events", {
      title: "Kelola Event - SPORTER",
      events,
    });
  } catch (err) {
    console.error("ERROR listEvents:", err);
    req.flash("error", "Gagal memuat data event.");
    return res.redirect("/admin");
  }
};

// Render form CREATE event
exports.renderCreateEvent = async (req, res) => {
  try {
    const [sports] = await db.query("SELECT id, name FROM sports ORDER BY name");
    const [venues] = await db.query("SELECT id, name FROM venues ORDER BY name");

    return res.render("admin/event_form", {
      title: "Buat Event - SPORTER",
      mode: "create",
      event: {},
      sports,
      venues,
    });
  } catch (err) {
    console.error("ERROR renderCreateEvent:", err);
    req.flash("error", "Gagal memuat form event.");
    return res.redirect("/admin/events");
  }
};

// Helper sederhana buat slug
function makeSlug(str = "") {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Handle CREATE event (POST)
exports.createEvent = async (req, res) => {
  try {
    let { sport_id, title, slug, description, start_date, end_date, venue_id, status } = req.body;

    if (!title || !start_date) {
      req.flash("error", "Judul dan tanggal mulai wajib diisi.");
      return res.redirect("/admin/events/create");
    }

    if (!slug || !slug.trim()) slug = makeSlug(title);
    if (!status) status = "upcoming";

    await db.query(
      `INSERT INTO events
       (sport_id, title, slug, description, start_date, end_date, venue_id, organizer_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        sport_id || null,
        title,
        slug,
        description || null,
        start_date,
        end_date || null,
        venue_id || null,
        req.session.user ? req.session.user.id : null,
        status,
      ]
    );

    req.flash("success", "Event berhasil dibuat.");
    return res.redirect("/admin/events");
  } catch (err) {
    console.error("ERROR createEvent:", err);
    req.flash("error", "Gagal membuat event.");
    return res.redirect("/admin/events/create");
  }
};

// Render form EDIT event
exports.renderEditEvent = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID event tidak valid.");
      return res.redirect("/admin/events");
    }

    const [[event]] = await db.query(
      `SELECT * FROM events WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!event) {
      req.flash("error", "Event tidak ditemukan.");
      return res.redirect("/admin/events");
    }

    const [sports] = await db.query("SELECT id, name FROM sports ORDER BY name");
    const [venues] = await db.query("SELECT id, name FROM venues ORDER BY name");

    return res.render("admin/event_form", {
      title: "Edit Event - SPORTER",
      mode: "edit",
      event,
      sports,
      venues,
    });
  } catch (err) {
    console.error("ERROR renderEditEvent:", err);
    req.flash("error", "Gagal memuat form edit event.");
    return res.redirect("/admin/events");
  }
};

// Handle UPDATE event
exports.updateEvent = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID event tidak valid.");
      return res.redirect("/admin/events");
    }

    let { sport_id, title, slug, description, start_date, end_date, venue_id, status } = req.body;

    if (!title || !start_date) {
      req.flash("error", "Judul dan tanggal mulai wajib diisi.");
      return res.redirect(`/admin/events/${id}/edit`);
    }

    if (!slug || !slug.trim()) slug = makeSlug(title);
    if (!status) status = "upcoming";

    await db.query(
      `UPDATE events
       SET sport_id = ?, title = ?, slug = ?, description = ?, start_date = ?, end_date = ?,
           venue_id = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        sport_id || null,
        title,
        slug,
        description || null,
        start_date,
        end_date || null,
        venue_id || null,
        status,
        id,
      ]
    );

    req.flash("success", "Event berhasil diupdate.");
    return res.redirect("/admin/events");
  } catch (err) {
    console.error("ERROR updateEvent:", err);
    req.flash("error", "Gagal mengupdate event.");
    return res.redirect("/admin/events");
  }
};

// Handle DELETE event
exports.deleteEvent = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID event tidak valid.");
      return res.redirect("/admin/events");
    }

    await db.query("DELETE FROM events WHERE id = ?", [id]);

    req.flash("success", "Event berhasil dihapus.");
    return res.redirect("/admin/events");
  } catch (err) {
    console.error("ERROR deleteEvent:", err);
    req.flash("error", "Gagal menghapus event.");
    return res.redirect("/admin/events");
  }
};
// ========== HELPER SLUG (pakai kalau belum ada) ==========
function makeSlug(str = "") {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ========== NEWS CRUD (ADMIN) ==========

// List semua berita
exports.listNews = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT n.id, n.title, n.slug, n.status, n.published_at,
              s.name AS sport_name,
              e.title AS event_title
       FROM news_articles n
       LEFT JOIN sports s ON s.id = n.sport_id
       LEFT JOIN events e ON e.id = n.event_id
       ORDER BY n.published_at DESC, n.created_at DESC`
    );

    return res.render("admin/news", {
      title: "Kelola Berita - SPORTER",
      news: rows,
    });
  } catch (err) {
    console.error("ERROR listNews:", err);
    req.flash("error", "Gagal memuat data berita.");
    return res.redirect("/admin");
  }
};

// Render form CREATE berita
exports.renderCreateNews = async (req, res) => {
  try {
    const [sports] = await db.query("SELECT id, name FROM sports ORDER BY name");
    const [events] = await db.query("SELECT id, title FROM events ORDER BY start_date DESC");

    return res.render("admin/news_form", {
      title: "Buat Berita - SPORTER",
      mode: "create",
      article: {},
      sports,
      events,
    });
  } catch (err) {
    console.error("ERROR renderCreateNews:", err);
    req.flash("error", "Gagal memuat form berita.");
    return res.redirect("/admin/news");
  }
};

// Handle CREATE berita
exports.createNews = async (req, res) => {
  try {
    let {
      sport_id,
      event_id,
      title,
      slug,
      excerpt,
      content,
      status,
      published_at,
    } = req.body;

    if (!title) {
      req.flash("error", "Judul wajib diisi.");
      return res.redirect("/admin/news/create");
    }

    if (!slug || !slug.trim()) slug = makeSlug(title);
    if (!status) status = "draft";

    // kalau ada file yang diupload
    let thumbnailUrl = null;
    if (req.file) {
      // karena app.use(express.static(path.join(__dirname, "public")))
      // maka path publiknya cukup '/uploads/news/namafile'
      thumbnailUrl = "/uploads/news/" + req.file.filename;
    }

    await db.query(
      `INSERT INTO news_articles
       (sport_id, event_id, author_id, title, slug, excerpt, content, thumbnail_url, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        sport_id || null,
        event_id || null,
        req.session.user ? req.session.user.id : null,
        title,
        slug,
        excerpt || null,
        content || "",
        thumbnailUrl,
        status,
        published_at || null,
      ]
    );

    req.flash("success", "Berita berhasil dibuat.");
    return res.redirect("/admin/news");
  } catch (err) {
    console.error("ERROR createNews (admin):", err);
    req.flash("error", "Gagal membuat berita.");
    return res.redirect("/admin/news/create");
  }
};

// Render form EDIT berita
exports.renderEditNews = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID berita tidak valid.");
      return res.redirect("/admin/news");
    }

    const [[article]] = await db.query(
      `SELECT * FROM news_articles WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!article) {
      req.flash("error", "Berita tidak ditemukan.");
      return res.redirect("/admin/news");
    }

    const [sports] = await db.query("SELECT id, name FROM sports ORDER BY name");
    const [events] = await db.query("SELECT id, title FROM events ORDER BY start_date DESC");

    return res.render("admin/news_form", {
      title: "Edit Berita - SPORTER",
      mode: "edit",
      article,
      sports,
      events,
    });
  } catch (err) {
    console.error("ERROR renderEditNews:", err);
    req.flash("error", "Gagal memuat form edit berita.");
    return res.redirect("/admin/news");
  }
};

// Handle UPDATE berita
exports.updateNews = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID berita tidak valid.");
      return res.redirect("/admin/news");
    }

    let {
      sport_id,
      event_id,
      title,
      slug,
      excerpt,
      content,
      status,
      published_at,
    } = req.body;

    if (!title) {
      req.flash("error", "Judul wajib diisi.");
      return res.redirect(`/admin/news/${id}/edit`);
    }

    if (!slug || !slug.trim()) slug = makeSlug(title);
    if (!status) status = "draft";

    // ambil data lama dulu biar kalau gak upload foto baru,
    // thumbnail yang lama tetap dipakai
    const [[current]] = await db.query(
      `SELECT thumbnail_url FROM news_articles WHERE id = ? LIMIT 1`,
      [id]
    );

    let thumbnailUrl = current ? current.thumbnail_url : null;
    if (req.file) {
      thumbnailUrl = "/uploads/news/" + req.file.filename;
    }

    await db.query(
      `UPDATE news_articles
       SET sport_id = ?, event_id = ?, title = ?, slug = ?, excerpt = ?,
           content = ?, thumbnail_url = ?, status = ?, published_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        sport_id || null,
        event_id || null,
        title,
        slug,
        excerpt || null,
        content || "",
        thumbnailUrl,
        status,
        published_at || null,
        id,
      ]
    );

    req.flash("success", "Berita berhasil diupdate.");
    return res.redirect("/admin/news");
  } catch (err) {
    console.error("ERROR updateNews:", err);
    req.flash("error", "Gagal mengupdate berita.");
    return res.redirect("/admin/news");
  }
};


// Handle DELETE berita
exports.deleteNews = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID berita tidak valid.");
      return res.redirect("/admin/news");
    }

    await db.query("DELETE FROM news_articles WHERE id = ?", [id]);

    req.flash("success", "Berita berhasil dihapus.");
    return res.redirect("/admin/news");
  } catch (err) {
    console.error("ERROR deleteNews:", err);
    req.flash("error", "Gagal menghapus berita.");
    return res.redirect("/admin/news");
  }
};
