// src/controllers/admin.controller.js
const db = require("../config/db");

exports.renderDashboard = async (req, res) => {
  try {
    // ambil statistik singkat
    const [[sportsCount]] = await db.query(
      "SELECT COUNT(*) AS total FROM sports"
    );
    const [[eventsCount]] = await db.query(
      "SELECT COUNT(*) AS total FROM events"
    );
    const [[upcomingEventsCount]] = await db.query(
      "SELECT COUNT(*) AS total FROM events WHERE status = 'upcoming'"
    );
    const [[newsCount]] = await db.query(
      "SELECT COUNT(*) AS total FROM news_articles WHERE status = 'published'"
    );

    // kalau ada tabel orders, kita hitung juga (kalau ga ada, boleh dihapus bagian ini)
    let ordersCount = { total: 0 };
    try {
      const [[row]] = await db.query(
        "SELECT COUNT(*) AS total FROM orders"
      );
      ordersCount = row;
    } catch (e) {
      // kalau tabel orders belum ada, biarin aja total = 0
    }

    // ambil 5 event terbaru
    const [recentEvents] = await db.query(
      `SELECT e.id, e.title, e.slug, e.start_date, e.status, s.name AS sport_name
       FROM events e
       LEFT JOIN sports s ON s.id = e.sport_id
       ORDER BY e.start_date DESC
       LIMIT 5`
    );

    // ambil 5 berita terbaru
    const [recentNews] = await db.query(
      `SELECT n.id, n.title, n.slug, n.published_at, sp.name AS sport_name
       FROM news_articles n
       LEFT JOIN sports sp ON sp.id = n.sport_id
       WHERE n.status = 'published'
       ORDER BY n.published_at DESC
       LIMIT 5`
    );

    res.render("admin/dashboard", {
      title: "Admin Dashboard - SPORTER",
      stats: {
        sports: sportsCount.total,
        events: eventsCount.total,
        upcomingEvents: upcomingEventsCount.total,
        news: newsCount.total,
        orders: ordersCount.total,
      },
      recentEvents,
      recentNews,
    });
  } catch (err) {
    console.error("ERROR renderDashboard:", err);
    res.status(500).send("Terjadi kesalahan saat memuat dashboard.");
  }
};
