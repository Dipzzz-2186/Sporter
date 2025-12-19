// src/models/favorites.model.js
const db = require('../config/db'); // sesuaikan kalau path beda

exports.findOne = async ({ userId, entityType, entityId }) => {
  const [rows] = await db.query(
    `SELECT id FROM user_favorites
     WHERE user_id = ? AND entity_type = ? AND entity_id = ?
     LIMIT 1`,
    [userId, entityType, entityId]
  );
  return rows[0] || null;
};

exports.insert = async ({ userId, entityType, entityId }) => {
  const [result] = await db.query(
    `INSERT INTO user_favorites (user_id, entity_type, entity_id)
     VALUES (?, ?, ?)`,
    [userId, entityType, entityId]
  );
  return result.insertId;
};

exports.removeById = async (id) => {
  await db.query(`DELETE FROM user_favorites WHERE id = ?`, [id]);
};

exports.listEventsByUser = async (userId) => {
  // NOTE: sesuaikan nama kolom event di DB lo
  const [rows] = await db.query(
    `
    SELECT
      e.id,
      e.slug,
      e.title,
      e.status,
      e.start_date,
      e.end_date,
      e.venue_name,
      s.name AS sport_name,
      uf.created_at AS saved_at
    FROM user_favorites uf
    JOIN events e ON e.id = uf.entity_id
    LEFT JOIN sports s ON s.id = e.sport_id
    WHERE uf.user_id = ?
      AND uf.entity_type = 'event'
    ORDER BY uf.created_at DESC
    `,
    [userId]
  );
  return rows;
};

exports.isFavorited = async ({ userId, entityType, entityId }) => {
  const found = await exports.findOne({ userId, entityType, entityId });
  return !!found;
};
