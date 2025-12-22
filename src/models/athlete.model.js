// src/models/athlete.model.js
const db = require("../config/db");

exports.updateById = async (id, data) => {
  const fields = [];
  const values = [];

  for (const [k, v] of Object.entries(data)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  values.push(id);

  const sql = `UPDATE athletes SET ${fields.join(', ')} WHERE id = ?`;
  const [result] = await db.query(sql, values);
  return result;
};

exports.findById = async (id) => {
  const [rows] = await db.query(`SELECT * FROM athletes WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
};
