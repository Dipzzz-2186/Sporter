// src/controllers/media.controller.js
const db = require("../config/db");
const {
    parseYouTubeEmbed,
    extractYouTubeId,
    getYouTubeThumbnail
} = require('../utils/media.util');

function getSportIconClass(sportName) {
    const icons = {
        'Sepak Bola': 'bi bi-emoji-angry-fill',
        'Basket': 'bi bi-basket2-fill',
        'Bulu Tangkis': 'bi bi-brightness-alt-high-fill',
        'Tenis': 'bi bi-circle-half',
        'Bola Voli': 'bi bi-circle-fill'
    };
    if (!sportName) return 'bi bi-trophy-fill';
    if (icons[sportName]) return icons[sportName];
    const s = String(sportName).toLowerCase();
    if (s.includes('sepak') || s.includes('football') || s.includes('soccer') || s.includes('bola')) return icons['Sepak Bola'];
    if (s.includes('basket')) return icons['Basket'];
    if (s.includes('bulu') || s.includes('badminton')) return icons['Bulu Tangkis'];
    if (s.includes('tenis') || s.includes('tennis')) return icons['Tenis'];
    if (s.includes('voli') || s.includes('volleyball')) return icons['Bola Voli'];
    return 'bi bi-trophy-fill';
}

// =====================
// LIST VIDEOS
// =====================
exports.listVideos = async (req, res) => {
    const { getYouTubeVideoStats } = require('../utils/youtube.util');

    const [rows] = await db.query(`
    SELECT v.*, s.name AS sport_name
    FROM videos v
    LEFT JOIN sports s ON s.id = v.sport_id
    WHERE v.type IN ('highlight', 'full_match')
      AND v.is_live = 0
    ORDER BY v.created_at DESC
  `);

    const videos = [];

    for (const v of rows) {
        const ytId = extractYouTubeId(v.url);

        let stats = {
            views: 0,
            likes: 0,
            comments: 0,
            duration: 0
        };

        if (ytId) {
            const yt = await getYouTubeVideoStats(ytId);
            if (yt) stats = yt;
        }

        videos.push({
            ...v,
            embed_url: parseYouTubeEmbed(v.url),
            thumbnail_url: v.thumbnail_url || getYouTubeThumbnail(v.url),
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            duration: stats.duration // ← MENIT
        });
    }

    res.render("videos/list", {
        title: "Video Pertandingan - SPORTER",
        videos,
        getSportIcon: getSportIconClass
    });
};

// =====================
// LIST LIVESTREAMS
// =====================
exports.listLivestreams = async (req, res) => {
    const { checkYouTubeLive } = require('../utils/youtube.util');

    const [rows] = await db.query(`
    SELECT *
    FROM videos
    WHERE type = 'livestream'
    ORDER BY created_at DESC
  `);

    const livestreams = [];

    for (const r of rows) {
        const ytId = extractYouTubeId(r.url);
        if (!ytId) continue;

        try {
            const yt = await checkYouTubeLive(ytId);

            // tampilkan kalau:
            // - DB bilang masih live
            // - ATAU YouTube bilang live
            if (!yt.isLive && r.is_live !== 1) continue;

            livestreams.push({
                ...r,
                is_live: yt.isLive ? 1 : r.is_live,
                views: yt.views,
                likes: yt.likes,
                comments: yt.comments,
                concurrent_viewers: yt.concurrentViewers,
                embedUrl: parseYouTubeEmbed(r.url),
                thumbnail_url: r.thumbnail_url || getYouTubeThumbnail(r.url),
                icon_class: getSportIconClass(r.sport_name)
            });

        } catch (err) {
            console.error('YT check failed', err);
        }
    }

    res.render('livestreams/list', {
        title: 'Livestream - SPORTER',
        livestreams
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

    if (livestream.is_live !== 1) {
        return res.redirect(`/videos/${livestream.id}`);
    }
    res.render("livestreams/view", { livestream, embedUrl });
};
