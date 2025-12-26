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
// src/models/event.model.js
exports.getAllEvents = async () => {
  const [rows] = await db.query(`
    SELECT 
      e.id, e.title, e.slug, e.start_date, e.end_date,
      e.description,
      v.name AS venue_name,
      s.name AS sport_name,
      CASE
        WHEN e.start_date IS NULL THEN 'upcoming'
        WHEN CURDATE() < DATE(e.start_date) THEN 'upcoming'
        WHEN e.end_date IS NOT NULL AND CURDATE() > DATE(e.end_date) THEN 'finished'
        ELSE 'ongoing'
      END AS status
    FROM events e
    LEFT JOIN venues v ON v.id = e.venue_id
    LEFT JOIN sports s ON s.id = e.sport_id
    ORDER BY e.start_date DESC
  `);
  return rows;
};

// Ambil detail event berdasarkan slug atau id
exports.getBySlugOrId = async (slugOrId) => {
  let rows;
  if (!slugOrId) return null;

  const base = `
    SELECT 
      e.*,
      v.name AS venue_name,
      s.name AS sport_name,
      CASE
        WHEN e.start_date IS NULL THEN 'upcoming'
        WHEN CURDATE() < DATE(e.start_date) THEN 'upcoming'
        WHEN e.end_date IS NOT NULL AND CURDATE() > DATE(e.end_date) THEN 'finished'
        ELSE 'ongoing'
      END AS computed_status
    FROM events e
    LEFT JOIN venues v ON v.id = e.venue_id
    LEFT JOIN sports s ON s.id = e.sport_id
  `;

  if (/^\\d+$/.test(String(slugOrId))) {
    [rows] = await db.query(`${base} WHERE e.id = ?`, [Number(slugOrId)]);
  } else {
    [rows] = await db.query(`${base} WHERE e.slug = ?`, [slugOrId]);
  }

  return rows[0] || null;
};
