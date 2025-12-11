const db = require("../config/db");

// Event untuk home (yang akan datang & sedang berlangsung)
exports.getFeaturedEvents = async () => {
  const [rows] = await db.query(
    `SELECT e.id, e.title, e.slug, e.start_date, e.end_date,
            e.description, v.name AS venue_name
     FROM events e
     LEFT JOIN venues v ON v.id = e.venue_id
     WHERE e.status IN ('upcoming','ongoing')
     ORDER BY e.start_date ASC
     LIMIT 4`
  );
  return rows;
};

// Event terbaru (untuk list di home)
exports.getLatestEvents = async () => {
  const [rows] = await db.query(
    `SELECT e.id, e.title, e.slug, e.start_date, e.end_date,
            e.description, v.name AS venue_name
     FROM events e
     LEFT JOIN venues v ON v.id = e.venue_id
     ORDER BY e.start_date DESC
     LIMIT 8`
  );
  return rows;
};

// List semua event untuk halaman /events
exports.getAllEvents = async () => {
  const [rows] = await db.query(
    `SELECT e.id, e.title, e.slug, e.start_date, e.end_date,
            e.status, e.description,
            v.name AS venue_name,
            s.name AS sport_name
     FROM events e
     LEFT JOIN venues v ON v.id = e.venue_id
     LEFT JOIN sports s ON s.id = e.sport_id
     ORDER BY e.start_date DESC`
  );
  return rows;
};

// Ambil detail event berdasarkan slug atau id
exports.getBySlugOrId = async (slugOrId) => {
  let rows;
  if (!slugOrId) return null;

  if (/^\d+$/.test(String(slugOrId))) {
    // kalau angka, cari berdasarkan id
    [rows] = await db.query(
      `SELECT e.*, v.name AS venue_name, s.name AS sport_name
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       LEFT JOIN sports s ON s.id = e.sport_id
       WHERE e.id = ?`,
      [Number(slugOrId)]
    );
  } else {
    // kalau string, cari berdasarkan slug
    [rows] = await db.query(
      `SELECT e.*, v.name AS venue_name, s.name AS sport_name
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       LEFT JOIN sports s ON s.id = e.sport_id
       WHERE e.slug = ?`,
      [slugOrId]
    );
  }

  return rows[0] || null;
};
