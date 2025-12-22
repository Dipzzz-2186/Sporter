// src/controllers/admin.controller.js
const db = require("../config/db");
const bcrypt = require("bcryptjs"); // lebih stabil di Windows/dev
const SALT_ROUNDS = 12;

/**
 * Render admin dashboard
 */
// ========== RENDER ADMIN DASHBOARD (FULL DATA LIKE SUBADMIN) ==========

exports.renderDashboard = async (req, res) => {
  try {
    const userId = req.session.user.id;

    // ambil semua sport karena admin boleh semua
    const [sports] = await db.query('SELECT id FROM sports');
    const sportIds = sports.map(s => s.id);
    const [standings] = await db.query(`
    SELECT s.team_id, t.name AS team, sp.name AS sport_name, s.played, s.win, s.draw, s.loss, s.pts
    FROM standings s
    LEFT JOIN teams t ON t.id = s.team_id
    LEFT JOIN sports sp ON sp.id = s.sport_id
    ORDER BY s.pts DESC, (s.goals_for - s.goals_against) DESC, s.goals_for DESC
    LIMIT 10
  `);
    if (sportIds.length === 0) {
      return res.render("admin/dashboard", {
        title: "Admin Dashboard - SPORTER",
        stats: { sports: 0, events: 0, matches: 0, videos: 0, livestreams: 0, ticketTypes: 0 },
        upcomingMatches: [],
        recentNews: [],
        recentVideos: [],
        upcomingLivestreams: [],
        recentEvents: [],
        standings: [],
        currentUser: req.session.user
      });
    }

    const placeholders = sportIds.map(() => '?').join(',');

    // Stats
    const [[cEvents]] = await db.query(
      `SELECT COUNT(id) AS total FROM events WHERE sport_id IN (${placeholders})`,
      sportIds
    );

    const [[cMatches]] = await db.query(
      `SELECT COUNT(id) AS total FROM matches WHERE sport_id IN (${placeholders})`,
      sportIds
    );

    const [[cVideos]] = await db.query(
      `SELECT COUNT(id) AS total FROM videos WHERE type <> 'livestream' AND sport_id IN (${placeholders})`,
      sportIds
    );

    const [[cLivestreams]] = await db.query(
      `SELECT COUNT(id) AS total FROM videos WHERE type = 'livestream' AND sport_id IN (${placeholders})`,
      sportIds
    );

    const [[cTicketTypes]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM ticket_types tt
       LEFT JOIN matches m ON m.id = tt.match_id
       LEFT JOIN events e ON e.id = tt.event_id
       WHERE COALESCE(m.sport_id, e.sport_id) IN (${placeholders})`,
      sportIds
    );

    const stats = {
      sports: sportIds.length,
      events: cEvents.total,
      matches: cMatches.total,
      videos: cVideos.total,
      livestreams: cLivestreams.total,
      ticketTypes: cTicketTypes.total
    };

    // Recent Events
    const [recentEvents] = await db.query(`
      SELECT e.id, e.title, e.slug, e.start_date, e.status, s.name AS sport_name
      FROM events e
      LEFT JOIN sports s ON s.id = e.sport_id
      ORDER BY e.start_date DESC
      LIMIT 6
    `);

    // Recent News
    const [recentNews] = await db.query(`
      SELECT n.id, n.title, n.slug, n.published_at, s.name AS sport_name
      FROM news_articles n
      LEFT JOIN sports s ON s.id = n.sport_id
      WHERE n.status = 'published'
      ORDER BY n.published_at DESC
      LIMIT 6
    `);

    // Recent Videos
    const [recentVideos] = await db.query(`
      SELECT id, title, thumbnail_url
      FROM videos
      WHERE type <> 'livestream'
      ORDER BY created_at DESC
      LIMIT 6
    `);

    // Upcoming Livestream
    const [upcomingLivestreams] = await db.query(`
      SELECT v.id, v.title, v.start_time, v.is_live, s.name AS sport_name
      FROM videos v
      LEFT JOIN sports s ON s.id = v.sport_id
      WHERE v.type = 'livestream'
      ORDER BY 
        v.is_live DESC,
        v.start_time IS NULL,
        v.start_time ASC
      LIMIT 6
    `);


    // Upcoming Matches
    const [upcomingMatches] = await db.query(`
      SELECT m.id, m.title, m.start_time, v.name AS venue_name,
             s.name AS sport_name,
             ht.name AS home_team_name, at.name AS away_team_name
      FROM matches m
      LEFT JOIN venues v ON v.id = m.venue_id
      LEFT JOIN sports s ON s.id = m.sport_id
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      WHERE m.start_time >= NOW()
      ORDER BY m.start_time ASC
      LIMIT 10
    `);

    return res.render("admin/dashboard", {
      title: "Admin Dashboard - SPORTER",
      stats,
      recentEvents,
      recentNews,
      recentVideos,
      upcomingLivestreams,
      upcomingMatches,
      standings,
      currentUser: req.session.user
    });

  } catch (err) {
    console.error("ERROR renderDashboard admin full:", err);
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
 * Render EDIT SubAdmin
 */
exports.renderEditSubadmin = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID tidak valid.");
      return res.redirect("/admin/subadmins");
    }

    // ambil data subadmin
    const [[sub]] = await db.query(
      "SELECT id, name, email FROM users WHERE id = ? AND role = 'subadmin' LIMIT 1",
      [id]
    );

    if (!sub) {
      req.flash("error", "SubAdmin tidak ditemukan.");
      return res.redirect("/admin/subadmins");
    }

    // ambil sport yang sudah diassign
    const [selectedSports] = await db.query(
      "SELECT sport_id FROM user_sports WHERE user_id = ?",
      [id]
    );
    const selectedIds = selectedSports.map(s => s.sport_id);

    // semua sport untuk ditampilkan dalam checkbox
    const [sports] = await db.query("SELECT id, name FROM sports ORDER BY name");

    return res.render("admin/edit_subadmin", {
      title: "Edit SubAdmin - SPORTER",
      subadmin: sub,
      sports,
      selectedIds
    });
  } catch (err) {
    console.error("ERROR renderEditSubadmin:", err);
    req.flash("error", "Gagal memuat form edit.");
    return res.redirect("/admin/subadmins");
  }
};


/**
 * Update SubAdmin
 */
exports.updateSubadmin = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID tidak valid.");
      return res.redirect("/admin/subadmins");
    }

    const { name, email, password } = req.body;
    let sport_ids = req.body.sport_ids || [];

    if (!name || !email) {
      req.flash("error", "Nama dan email wajib diisi.");
      return res.redirect(`/admin/subadmins/${id}/edit`);
    }

    // normalisasi sport_ids → array
    if (!Array.isArray(sport_ids)) {
      if (typeof sport_ids === "string" && sport_ids.trim() !== "") {
        sport_ids = sport_ids.split(",").map(s => s.trim());
      } else sport_ids = [];
    }
    sport_ids = sport_ids.map(Number).filter(Boolean);

    // cek subadmin exists
    const [[sub]] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 'subadmin' LIMIT 1",
      [id]
    );
    if (!sub) {
      req.flash("error", "SubAdmin tidak ditemukan.");
      return res.redirect("/admin/subadmins");
    }

    // update basic info
    let sql = "UPDATE users SET name = ?, email = ?";
    let params = [name, email];

    if (password && password.trim() !== "") {
      const hash = bcrypt.hashSync(password, SALT_ROUNDS);
      sql += ", password_hash = ?";
      params.push(hash);
    }

    sql += ", updated_at = NOW() WHERE id = ?";
    params.push(id);

    await db.query(sql, params);

    // replace sports assignment
    await db.query("DELETE FROM user_sports WHERE user_id = ?", [id]);

    if (sport_ids.length > 0) {
      const values = sport_ids.map(sid => [
        id,
        sid,
        req.session.user ? req.session.user.id : null
      ]);
      await db.query("INSERT INTO user_sports (user_id, sport_id, assigned_by) VALUES ?", [values]);
    }

    req.flash("success", "SubAdmin berhasil diperbarui.");
    return res.redirect("/admin/subadmins");
  } catch (err) {
    console.error("ERROR updateSubadmin:", err);
    req.flash("error", "Gagal mengupdate SubAdmin.");
    return res.redirect("/admin/subadmins");
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

// SELLER MANAGEMENT CONTROLLERS
exports.listSellers = async (req, res) => {
  const [rows] = await db.query(`
    SELECT id, name, email, created_at
    FROM users
    WHERE role = 'seller'
    ORDER BY created_at DESC
  `);
  res.render("admin/sellers", { title: "Manage Seller", sellers: rows });
};

exports.renderCreateSeller = async (req, res) => {
  try {
    const [sports] = await db.query("SELECT id, name FROM sports ORDER BY name");
    return res.render("admin/create_seller", { title: "Buat Seller - SPORTER", sports });
  } catch (err) {
    console.error("ERROR renderCreateSeller:", err);
    req.flash("error", "Gagal memuat form.");
    return res.redirect("/admin");
  }
};

exports.createSeller = async (req, res) => {
  const { name, email, password } = req.body;
  const hash = bcrypt.hashSync(password, 12);

  await db.query(
    "INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,'seller',NOW())",
    [name, email, hash]
  );

  req.flash("success", "Seller berhasil dibuat");
  res.redirect("/admin/sellers");
};
/**
 * Render EDIT Seller
 */
exports.renderEditSeller = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID tidak valid.");
      return res.redirect("/admin/sellers");
    }

    // ambil data seller
    const [[sub]] = await db.query(
      "SELECT id, name, email FROM users WHERE id = ? AND role = 'seller' LIMIT 1",
      [id]
    );

    if (!sub) {
      req.flash("error", "Seller tidak ditemukan.");
      return res.redirect("/admin/sellers");
    }

    // ambil sport yang sudah diassign
    const [selectedSports] = await db.query(
      "SELECT sport_id FROM user_sports WHERE user_id = ?",
      [id]
    );
    const selectedIds = selectedSports.map(s => s.sport_id);

    // semua sport untuk ditampilkan dalam checkbox
    const [sports] = await db.query("SELECT id, name FROM sports ORDER BY name");

    return res.render("admin/create_seller", {
      title: "Edit Seller - SPORTER",
      sellerData: sub,
      sports,
      selectedIds,
      mode: "edit"
    });
  } catch (err) {
    console.error("ERROR renderEditSeller:", err);
    req.flash("error", "Gagal memuat form edit.");
    return res.redirect("/admin/sellers");
  }
};


/**
 * Update seller
 */
exports.updateSeller = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID tidak valid.");
      return res.redirect("/admin/sellers");
    }

    const { name, email, password } = req.body;
    let sport_ids = req.body.sport_ids || [];

    if (!name || !email) {
      req.flash("error", "Nama dan email wajib diisi.");
      return res.redirect(`/admin/sellers/${id}/edit`);
    }

    // normalisasi sport_ids → array
    if (!Array.isArray(sport_ids)) {
      if (typeof sport_ids === "string" && sport_ids.trim() !== "") {
        sport_ids = sport_ids.split(",").map(s => s.trim());
      } else sport_ids = [];
    }
    sport_ids = sport_ids.map(Number).filter(Boolean);

    // cek seller exists
    const [[sub]] = await db.query(
      "SELECT id FROM users WHERE id = ? AND role = 'seller' LIMIT 1",
      [id]
    );
    if (!sub) {
      req.flash("error", "Seller tidak ditemukan.");
      return res.redirect("/admin/sellers");
    }

    // update basic info
    let sql = "UPDATE users SET name = ?, email = ?";
    let params = [name, email];

    if (password && password.trim() !== "") {
      const hash = bcrypt.hashSync(password, SALT_ROUNDS);
      sql += ", password_hash = ?";
      params.push(hash);
    }

    sql += ", updated_at = NOW() WHERE id = ?";
    params.push(id);

    await db.query(sql, params);

    // replace sports assignment
    await db.query("DELETE FROM user_sports WHERE user_id = ?", [id]);

    if (sport_ids.length > 0) {
      const values = sport_ids.map(sid => [
        id,
        sid,
        req.session.user ? req.session.user.id : null
      ]);
      await db.query("INSERT INTO user_sports (user_id, sport_id, assigned_by) VALUES ?", [values]);
    }

    req.flash("success", "Seller berhasil diperbarui.");
    return res.redirect("/admin/sellers");
  } catch (err) {
    console.error("ERROR updateSeller:", err);
    req.flash("error", "Gagal mengupdate Seller.");
    return res.redirect("/admin/sellers");
  }
};


/**
 * Delete Seller
 */
exports.deleteSeller = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID tidak valid.");
      return res.redirect("/admin/sellers");
    }
    await db.query("DELETE FROM users WHERE id = ? AND role = 'seller'", [id]);
    req.flash("success", "Seller dihapus.");
    return res.redirect("/admin/sellers");
  } catch (err) {
    console.error("ERROR deleteSeller:", err);
    req.flash("error", "Gagal menghapus Seller.");
    return res.redirect("/admin/sellers");
  }
};

// ========== ADMIN READ-ONLY: MATCHES ==========
exports.listMatchesReadOnly = async (req, res) => {
  try {
    const { sport_id, order } = req.query;

    const [sports] = await db.query(
      'SELECT id, name FROM sports ORDER BY name'
    );

    let where = [];
    let params = [];

    if (sport_id) {
      where.push('m.sport_id = ?');
      params.push(sport_id);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql =
      order === 'oldest'
        ? 'ORDER BY m.created_at ASC'
        : 'ORDER BY m.created_at DESC';

    const [matches] = await db.query(`
      SELECT
        m.id,
        m.title,
        m.start_time,
        m.end_time,
        m.status,
        m.match_mode,
        s.name AS sport_name,
        v.name AS venue_name,
        e.title AS event_title,
        ht.name AS home_team_name,
        at.name AS away_team_name
      FROM matches m
      LEFT JOIN sports s ON s.id = m.sport_id
      LEFT JOIN venues v ON v.id = m.venue_id
      LEFT JOIN events e ON e.id = m.event_id
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      ${whereSql}
      ${orderSql}
    `, params);

    return res.render('subadmin/matches', {
      title: 'Daftar Pertandingan',
      matches,
      sports,
      query: req.query,
      isReadOnly: true   // 🔑 KUNCI
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

// ========== ADMIN READ-ONLY: STANDINGS ==========
exports.listStandingsReadOnly = async (req, res) => {
  try {
    const [sports] = await db.query(
      'SELECT id, name FROM sports ORDER BY name'
    );

    const qSport = req.query.sport_id
      ? Number(req.query.sport_id)
      : null;

    if (!qSport) {
      return res.render('standings/index', {
        title: 'Klasemen',
        standings: [],
        sports,
        query: req.query,
        isPadel: false,
        isReadOnly: true
      });
    }

    const [[sport]] = await db.query(
      'SELECT id, name FROM sports WHERE id = ?',
      [qSport]
    );

    if (!sport) {
      return res.render('standings/index', {
        title: 'Klasemen',
        standings: [],
        sports,
        query: req.query,
        isPadel: false,
        isReadOnly: true
      });
    }

    const isPadel = sport.name.toLowerCase() === 'padel';
    let rows = [];

    if (isPadel) {
      [rows] = await db.query(`
        SELECT
          s.id,
          s.sport_id,
          sp.name AS sport_name,
          t.name AS team_name,
          (
            SELECT COUNT(*)
            FROM matches m
            WHERE m.sport_id = s.sport_id
              AND s.team_id IN (m.home_team_id, m.away_team_id)
          ) AS total_match,
          s.win,
          s.loss,
          s.game_win,
          s.game_loss,
          (s.game_win - s.game_loss) AS game_diff,
          s.pts
        FROM standings s
        JOIN teams t ON t.id = s.team_id
        JOIN sports sp ON sp.id = s.sport_id
        WHERE s.sport_id = ?
        ORDER BY s.pts DESC, game_diff DESC, s.game_win DESC
      `, [qSport]);
    } else {
      [rows] = await db.query(`
        SELECT
          s.id,
          s.sport_id,
          sp.name AS sport_name,
          t.name AS team_name,
          s.played,
          s.win,
          s.draw,
          s.loss,
          s.goals_for,
          s.goals_against,
          (s.goals_for - s.goals_against) AS goal_diff,
          s.pts
        FROM standings s
        JOIN teams t ON t.id = s.team_id
        JOIN sports sp ON sp.id = s.sport_id
        WHERE s.sport_id = ?
        ORDER BY s.pts DESC, goal_diff DESC, s.goals_for DESC
      `, [qSport]);
    }

    return res.render('standings/index', {
      title: 'Klasemen',
      standings: rows,
      sports,
      query: req.query,
      isPadel,
      isReadOnly: true
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};
exports.listVideosAsAdmin = async (req, res) => {
  try {
    const [videos] = await db.query(`
      SELECT
        v.id,
        v.title,
        v.thumbnail_url,
        v.type,
        s.name AS sport_name
      FROM videos v
      LEFT JOIN sports s ON s.id = v.sport_id
      WHERE v.type <> 'livestream'
      ORDER BY v.created_at DESC
    `);

    res.render("subadmin/videos", {
      title: "Kelola Video",
      videos,
      currentUser: req.session.user,
      isAdmin: true
    });
  } catch (err) {
    console.error("ERROR admin videos:", err);
    res.status(500).send("Server error");
  }
};


exports.listLivestreamsAsAdmin = async (req, res) => {
  try {
    const [livestreams] = await db.query(`
      SELECT
        v.id,
        v.title,
        v.is_live,
        v.start_time,
        s.name AS sport_name
      FROM videos v
      LEFT JOIN sports s ON s.id = v.sport_id
      WHERE v.type = 'livestream'
      ORDER BY
        v.is_live DESC,
        v.start_time IS NULL,
        v.start_time ASC
    `);

    res.render("subadmin/livestreams", {
      title: "Kelola Livestream",
      livestreams,
      currentUser: req.session.user,
      isAdmin: true
    });
  } catch (err) {
    console.error("ERROR admin livestreams:", err);
    res.status(500).send("Server error");
  }
};
