// src/controllers/media.controller.js
const db = require("../config/db");
const News = require("../models/news.model");
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
        WHERE 
        (
            v.type IN ('highlight', 'full_match')
            OR (v.type = 'livestream' AND v.is_live = 0)
        )
        ORDER BY v.created_at DESC
    `);

    const videos = [];

    for (const v of rows) {
        const ytId = extractYouTubeId(v.url);

        let stats = { views: 0, likes: 0, comments: 0, duration: 0 };

        if (ytId) {
            const yt = await getYouTubeVideoStats(ytId);
            if (yt) stats = yt;
        }

        // Use YouTube `publishedAt` only (per request). If absent, leave null so template shows 'Tanggal tidak tersedia'.
        const publishedAtCandidate = stats.publishedAt || null;

        videos.push({
            ...v,
            embed_url: parseYouTubeEmbed(v.url),
            thumbnail_url: v.thumbnail_url || getYouTubeThumbnail(v.url),
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            duration: stats.duration,
            published_at: publishedAtCandidate
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
    SELECT 
    v.*,
    s.name AS sport_name
    FROM videos v
    LEFT JOIN sports s ON s.id = v.sport_id
    WHERE v.type = 'livestream'
    AND v.is_live = 1
    ORDER BY v.created_at DESC
    `);

    const livestreams = [];

    for (const r of rows) {
        const ytId = extractYouTubeId(r.url);
        if (!ytId) continue;

        try {
            const yt = await checkYouTubeLive(ytId);

            // ❌ tidak live → sync DB + skip
            if (!yt.isLive) {
                await db.query(
                    'UPDATE videos SET is_live = 0 WHERE id = ?',
                    [r.id]
                );
                continue;
            }

            // ✅ LIVE → tampilkan
            // Use YouTube publishedAt only for livestreams; if absent keep null
            const publishedAtLive = yt.publishedAt || null;

            livestreams.push({
                ...r,
                sport_name: r.sport_name,
                is_live: 1,
                views: yt.views,
                likes: yt.likes,
                comments: yt.comments,
                concurrent_viewers: yt.concurrentViewers,
                embedUrl: parseYouTubeEmbed(r.url),
                thumbnail_url: r.thumbnail_url || getYouTubeThumbnail(r.url),
                icon_class: getSportIconClass(r.sport_name),
                published_at: publishedAtLive
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
    const { getYouTubeVideoStats } = require('../utils/youtube.util');

    const [[video]] = await db.query(`
        SELECT v.*, s.name AS sport_name
        FROM videos v
        LEFT JOIN sports s ON s.id = v.sport_id
        WHERE v.id = ?
        LIMIT 1
    `, [id]);

    if (!video) return res.status(404).send('Video tidak ditemukan');

    // 🔒 HARD RULE
    // viewVideo TIDAK BOLEH HANDLE LIVESTREAM
    if (video.type === 'livestream' && video.is_live === 1) {
        return res.redirect(`/livestreams/${video.id}`);
    }

    // Try to fetch YouTube stats for this video to obtain publishedAt
    try {
        const ytId = extractYouTubeId(video.url);
        if (ytId) {
            const yt = await getYouTubeVideoStats(ytId);

            video.published_at =
                yt?.publishedAt ||
                video.published_at ||
                video.created_at ||
                null;

            // ✅ AMBIL DARI YOUTUBE
            video.views = Number(yt?.views) || 0;
            video.likes = Number(yt?.likes) || 0;
            video.comments = Number(yt?.comments) || 0;
        } else {
            video.views = 0;
            video.likes = 0;
            video.comments = 0;
        }
    } catch (err) {
        console.error('Failed to fetch YT stats for viewVideo', err);
        video.published_at = video.published_at || video.created_at || null;
    }

    let newsTicker = [];
    try {
        newsTicker = await News.getLatestNews(10);
    } catch (err) {
        console.error('Failed to load news ticker for viewVideo', err);
        newsTicker = [];
    }
    res.render('videos/view', {
        video,
        embedUrl: parseYouTubeEmbed(video.url),
        isLiveNow: false,
        newsTicker
    });
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
    // Try to fetch YouTube live details to get publishedAt if available
    try {
        const { checkYouTubeLive } = require('../utils/youtube.util');
        const ytId = extractYouTubeId(livestream.url);

        if (ytId) {
            const yt = await checkYouTubeLive(ytId);

            livestream.published_at =
                yt?.publishedAt ||
                livestream.published_at ||
                livestream.created_at ||
                null;

            // ✅ WAJIB SET STATS
            livestream.views = Number(yt?.views) || 0;
            livestream.likes = Number(yt?.likes) || 0;
            livestream.comments = Number(yt?.comments) || 0;
            livestream.concurrent_viewers = Number(yt?.concurrentViewers) || 0;
        } else {
            livestream.views = 0;
            livestream.likes = 0;
            livestream.comments = 0;
            livestream.concurrent_viewers = 0;
        }
    } catch (err) {
        console.error('Failed to fetch YT live details for viewLivestream', err);

        livestream.published_at = livestream.published_at || livestream.created_at || null;
        livestream.views = 0;
        livestream.likes = 0;
        livestream.comments = 0;
        livestream.concurrent_viewers = 0;
    }

    let newsTicker = [];
    try {
        newsTicker = await News.getLatestNews(10);
    } catch (err) {
        console.error('Failed to load news ticker for viewLivestream', err);
        newsTicker = [];
    }
    res.render("livestreams/view", { livestream, embedUrl, newsTicker });
};







