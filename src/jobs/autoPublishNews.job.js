// src/jobs/autoPublishNews.job.js
const cron = require('node-cron');
const db = require('../config/db');

cron.schedule('* * * * *', async () => { // tiap 1 menit
  try {
    await db.query(`
      UPDATE news_articles
      SET status = 'published'
      WHERE status = 'draft'
        AND published_at IS NOT NULL
        AND published_at <= NOW()
    `);
  } catch (e) {
    console.error('autoPublishNews error:', e);
  }
});
