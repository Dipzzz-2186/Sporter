// src/controllers/media.controller.js
const db = require("../config/db");

// helper untuk parse YouTube embed
function parseYouTubeEmbed(input) {
    if (!input) return null;

    input = input.trim();

    // make sure URL parsable
    if (!/^https?:\/\//i.test(input)) {
        input = 'https://' + input;
    }

    let u;
    try {
        u = new URL(input);
    } catch (e) {
        return null;
    }

    const host = u.hostname;

    // youtu.be short link
    if (host.includes('youtu.be')) {
        const id = u.pathname.replace('/', '');
        return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    // youtube.com/* variants
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {

        // NEW: support /live/VIDEO_ID
        if (u.pathname.startsWith('/live/')) {
            const id = u.pathname.split('/')[2];
            return id ? `https://www.youtube.com/embed/${id}` : null;
        }

        // /watch?v=ID
        const v = u.searchParams.get('v');
        if (v) return `https://www.youtube.com/embed/${v}`;

        // /embed/ID
        if (u.pathname.startsWith('/embed/')) {
            const id = u.pathname.split('/')[2];
            return id ? `https://www.youtube.com/embed/${id}` : null;
        }
    }

    return null;
}

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
        getSportIcon: getSportIconClass   // <--- KIRIM KE PUG
    });
};

// =====================
// LIST LIVESTREAMS
// =====================
exports.listLivestreams = async (req, res) => {
    const [rows] = await db.query(`
  SELECT v.id, v.title, v.is_live, v.start_time, v.thumbnail_url, v.url, v.description,
         s.name AS sport_name, e.title AS event_title
  FROM videos v
  LEFT JOIN sports s ON s.id = v.sport_id
  LEFT JOIN events e ON e.id = v.event_id
  WHERE v.type = 'livestream'
  ORDER BY COALESCE(v.start_time, v.created_at) DESC
`);

    const livestreams = rows.map(r => {
        const embedUrl = parseYouTubeEmbed(r.url);
        // try to derive id from multiple patterns
        let ytId = null;
        if (r.url) {
            let m = r.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
            if (!m) m = r.url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
            if (!m) m = r.url.match(/youtube\.com\/live\/([A-Za-z0-9_-]{6,})/);
            if (m && m[1]) ytId = m[1];
        }
        const thumbnail_url = r.thumbnail_url || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);

        // server-side icon class
        const icon_class = getSportIconClass(r.sport_name);

        return {
            ...r,
            embedUrl,
            thumbnail_url,
            icon_class
        };
    });

    res.render("livestreams/list", {
        title: "Livestream - SPORTER",
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

    res.render("livestreams/view", { livestream, embedUrl });
};
