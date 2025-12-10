// src/models/user.model.js
const db = require("../config/db");

exports.getByEmail = async (email) => {
  const [rows] = await db.query(
    "SELECT id, email, password_hash, role FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] || null;
};

exports.getById = async (id) => {
  const [rows] = await db.query(
    "SELECT id, email, role FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
};
