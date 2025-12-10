// src/controllers/media.controller.js
const db = require("../config/db");

// helper untuk parse YouTube embed
function parseYouTubeEmbed(url) {
    if (!url) return null;

    try {
        const ytRegex =
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;

        const match = url.match(ytRegex);
        if (!match) return null;

        return `https://www.youtube.com/embed/${match[1]}`;
    } catch (e) {
        return null;
    }
}

// =====================
// LIST VIDEOS
// =====================
exports.listVideos = async (req, res) => {
    const [rows] = await db.query(`
    SELECT v.id, v.title, v.type, v.thumbnail_url, 
           s.name AS sport_name, e.title AS event_title
    FROM videos v
    LEFT JOIN sports s ON s.id = v.sport_id
    LEFT JOIN events e ON e.id = v.event_id
    WHERE v.type IN ('full_match','highlight')
    ORDER BY v.created_at DESC
  `);

    res.render("videos/list", {
        title: "Video Pertandingan - SPORTER",
        videos: rows,
    });
};

// =====================
// LIST LIVESTREAMS
// =====================
exports.listLivestreams = async (req, res) => {
    const [rows] = await db.query(`
    SELECT v.id, v.title, v.is_live, v.start_time, v.thumbnail_url,
           s.name AS sport_name, e.title AS event_title
    FROM videos v
    LEFT JOIN sports s ON s.id = v.sport_id
    LEFT JOIN events e ON e.id = v.event_id
    WHERE v.type = 'livestream'
    ORDER BY v.start_time DESC
  `);

    res.render("livestreams/list", {
        title: "Livestream - SPORTER",
        livestreams: rows,
    });
};

// =====================
// VIEW VIDEO
// =====================
exports.viewVideo = async (req, res) => {
    const { id } = req.params;

    const [rows] = await db.query(
        `
    SELECT v.*, 
           s.name AS sport_name,
           e.title AS event_title,
           m.title AS match_title
    FROM videos v
    LEFT JOIN sports s ON s.id = v.sport_id
    LEFT JOIN events e ON e.id = v.event_id
    LEFT JOIN matches m ON m.id = v.match_id
    WHERE v.id = ?
    LIMIT 1
    `,
        [id]
    );

    if (!rows.length) return res.status(404).send("Video tidak ditemukan.");

    const video = rows[0];
    const embedUrl = parseYouTubeEmbed(video.url);

    res.render("videos/view", { video, embedUrl });
};

// =====================
// VIEW LIVESTREAM
// =====================
exports.viewLivestream = async (req, res) => {
    const { id } = req.params;

    const [rows] = await db.query(
        `
    SELECT v.*, 
           s.name AS sport_name,
           e.title AS event_title,
           m.title AS match_title
    FROM videos v
    LEFT JOIN sports s ON s.id = v.sport_id
    LEFT JOIN events e ON e.id = v.event_id
    LEFT JOIN matches m ON m.id = v.match_id
    WHERE v.id = ? AND v.type = 'livestream'
    LIMIT 1
    `,
        [id]
    );

    if (!rows.length) return res.status(404).send("Livestream tidak ditemukan.");

    const livestream = rows[0];
    const embedUrl = parseYouTubeEmbed(livestream.url);

    res.render("livestreams/view", { livestream, embedUrl });
};
