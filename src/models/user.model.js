// src/models/user.model.js
const db = require("../config/db");

exports.getByEmail = async (email) => {
  const [rows] = await db.query(
    "SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1",
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

exports.createUser = async ({ name, email, password_hash, role = "user" }) => {
  const [result] = await db.query(
    "INSERT INTO users (name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
    [name, email, password_hash, role]
  );
  return result.insertId;
};
