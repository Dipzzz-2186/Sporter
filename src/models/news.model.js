// src/models/news.model.js
const db = require("../config/db");

exports.getLatestNews = async (limit = 10) => {
  const [rows] = await db.query(
    `
    SELECT n.id, n.title, n.slug, n.excerpt, n.thumbnail_url, 
           n.published_at, s.name AS sport_name
    FROM news_articles n
    LEFT JOIN sports s ON s.id = n.sport_id
    WHERE n.status = 'published'
    ORDER BY n.published_at DESC
    LIMIT ?
    `,
    [limit]
  );
  return rows;
};


exports.getNewsBySlug = async (slug) => {
  const [rows] = await db.query(
    `SELECT n.*, s.name AS sport_name
     FROM news_articles n
     LEFT JOIN sports s ON s.id = n.sport_id
     WHERE n.slug = ? AND n.status = 'published'
     LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
};
