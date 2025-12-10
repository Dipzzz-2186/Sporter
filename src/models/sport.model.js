const db = require("../config/db");

exports.getAll = async () => {
  const [rows] = await db.query("SELECT * FROM sports ORDER BY name ASC");
  return rows;
};
