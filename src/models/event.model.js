const db = require("../config/db");

// event utama (misal 1–3 teratas)
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

// event lain untuk list
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
