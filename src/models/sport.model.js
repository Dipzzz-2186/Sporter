const db = require("../config/db");

exports.getAll = async () => {
  const [rows] = await db.query(
    "SELECT id, name, slug, description FROM sports ORDER BY name ASC"
  );
  return rows;
};

exports.getBySlug = async (slug) => {
  const [rows] = await db.query(
    "SELECT id, name, slug, description FROM sports WHERE slug = ? LIMIT 1",
    [slug]
  );
  return rows[0] || null;
};
