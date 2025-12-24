// src/jobs/syncYoutubeLive.js
const db = require('../config/db');
const { extractYouTubeId } = require('../utils/media.util');
const { checkYouTubeLive } = require('../utils/youtube.util');

async function syncYoutubeLive() {
    const [rows] = await db.query(`
    SELECT id, url, is_live
    FROM videos
    WHERE type = 'livestream'
  `);

    for (const v of rows) {
        const ytId = extractYouTubeId(v.url);
        if (!ytId) continue;

        try {
            const yt = await checkYouTubeLive(ytId);
            const isLive = yt.isLive ? 1 : 0;

            if (isLive !== v.is_live) {
                await db.query(
                    'UPDATE videos SET is_live = ?, updated_at = NOW() WHERE id = ?',
                    [isLive, v.id]
                );
            }
        } catch (err) {
            console.error('YT sync failed', ytId, err.message);
        }
    }
}

module.exports = syncYoutubeLive;
