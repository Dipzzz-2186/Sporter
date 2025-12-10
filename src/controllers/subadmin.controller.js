// src/controllers/subadmin.controller.js
const db = require('../config/db');
const { parseYouTubeEmbed } = require('../utils/media.util'); // helper below

// Render form helpers (reuse sports list)
async function loadSportsList() {
    const [sports] = await db.query('SELECT id, name FROM sports ORDER BY name');
    return sports;
}
// render dashboard untuk subadmin
exports.renderDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // 1) ambil sports yang di-assign ke subadmin (admin akan di-handle: jika admin, ambil semua sports)
        let sportFilterSql = '';
        let sportIds = [];
        if (req.session.user.role === 'admin') {
            const [allSports] = await db.query('SELECT id FROM sports');
            sportIds = allSports.map(r => r.id);
        } else {
            const [rows] = await db.query('SELECT sport_id FROM user_sports WHERE user_id = ?', [userId]);
            sportIds = rows.map(r => r.sport_id);
        }

        if (!sportIds || sportIds.length === 0) {
            // no assigned sports
            return res.render('subadmin/dashboard', {
                title: 'SubAdmin Dashboard - SPORTER',
                stats: { sports: 0, events: 0, matches: 0, videos: 0, livestreams: 0, ticketTypes: 0 },
                upcomingMatches: [],
                recentNews: [],
                recentVideos: [],
                upcomingLivestreams: []
            });
        }

        // prepare SQL IN clause safe
        const placeholders = sportIds.map(() => '?').join(',');
        sportFilterSql = `AND s.id IN (${placeholders})`;

        // 2) counts
        const [[cEvents]] = await db.query(
            `SELECT COUNT(DISTINCT e.id) AS total FROM events e LEFT JOIN sports s ON s.id = e.sport_id WHERE 1=1 ${sportFilterSql}`,
            sportIds
        );
        const [[cMatches]] = await db.query(
            `SELECT COUNT(*) AS total FROM matches m LEFT JOIN sports s ON s.id = m.sport_id WHERE 1=1 ${sportFilterSql}`,
            sportIds
        );
        const [[cVideos]] = await db.query(
            `SELECT COUNT(*) AS total FROM videos v LEFT JOIN sports s ON s.id = v.sport_id WHERE v.type <> 'livestream' ${sportFilterSql}`,
            sportIds
        );
        const [[cLivestreams]] = await db.query(
            `SELECT COUNT(*) AS total FROM videos v LEFT JOIN sports s ON s.id = v.sport_id WHERE v.type = 'livestream' ${sportFilterSql}`,
            sportIds
        );
        const [[cTicketTypes]] = await db.query(
            `SELECT COUNT(*) AS total FROM ticket_types tt LEFT JOIN matches m ON m.id = tt.match_id LEFT JOIN events e ON e.id = tt.event_id LEFT JOIN sports s ON COALESCE(m.sport_id, e.sport_id) = s.id WHERE 1=1 ${sportFilterSql}`,
            sportIds
        );
        const stats = {
            sports: sportIds.length,
            events: cEvents.total || 0,
            matches: cMatches.total || 0,
            videos: cVideos.total || 0,
            livestreams: cLivestreams.total || 0,
            ticketTypes: cTicketTypes.total || 0
        };

        // 3) upcoming matches (with ticket availability & default ticket type)
        // For ticket logic: determine earliest associated ticket_type for match (or event). We'll join ticket_types and compute availability and can_buy flags.
        const [upcomingMatches] = await db.query(
            `
      SELECT m.id, m.title, m.start_time, m.venue_id, v.name AS venue_name,
             s.name AS sport_name,
             ht.name AS home_team_name, at.name AS away_team_name,
             tt.id AS default_ticket_type_id, tt.price, tt.quota, tt.sold,
             (tt.quota - tt.sold) AS ticket_available
      FROM matches m
      LEFT JOIN venues v ON v.id = m.venue_id
      LEFT JOIN sports s ON s.id = m.sport_id
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      LEFT JOIN (
        SELECT * FROM ticket_types tt1
        WHERE tt1.id = (
          SELECT tt2.id FROM ticket_types tt2 WHERE tt2.match_id = tt1.match_id ORDER BY tt2.id LIMIT 1
        )
      ) tt ON tt.match_id = m.id
      WHERE m.start_time IS NOT NULL
        AND m.start_time >= NOW()
        ${sportFilterSql}
      ORDER BY m.start_time ASC
      LIMIT 20
      `,
            [...sportIds]
        );

        // map can_buy flag per match (if match has ticket type) and ensure start_time > now
        const now = new Date();
        const mappedMatches = upcomingMatches.map(m => {
            const startTime = m.start_time ? new Date(m.start_time) : null;
            const ticket_available = Number(m.ticket_available || 0);
            const can_buy = Boolean(startTime && startTime > now && ticket_available > 0 && m.default_ticket_type_id);
            return {
                ...m,
                ticket_available,
                can_buy,
            };
        });

        // 4) recent news, videos, upcoming livestreams
        const [recentNews] = await db.query(
            `
      SELECT n.id, n.title, n.slug, n.published_at
      FROM news_articles n
      LEFT JOIN sports s ON s.id = n.sport_id
      WHERE n.status = 'published' ${sportFilterSql}
      ORDER BY n.published_at DESC
      LIMIT 6
      `,
            [...sportIds]
        );

        const [recentVideos] = await db.query(
            `
      SELECT v.id, v.title, v.thumbnail_url
      FROM videos v
      LEFT JOIN sports s ON s.id = v.sport_id
      WHERE v.type <> 'livestream' ${sportFilterSql}
      ORDER BY v.created_at DESC
      LIMIT 6
      `,
            [...sportIds]
        );

        const [upcomingLivestreams] = await db.query(
            `
      SELECT v.id, v.title, v.start_time, v.is_live, s.name AS sport_name
      FROM videos v
      LEFT JOIN sports s ON s.id = v.sport_id
      WHERE v.type = 'livestream' AND (v.start_time >= NOW() OR v.is_live = 1) ${sportFilterSql}
      ORDER BY v.start_time ASC
      LIMIT 6
      `,
            [...sportIds]
        );

        return res.render('subadmin/dashboard', {
            title: 'SubAdmin Dashboard - SPORTER',
            stats,
            upcomingMatches: mappedMatches,
            recentNews,
            recentVideos,
            upcomingLivestreams
        });

    } catch (err) {
        console.error('renderDashboard subadmin error', err);
        req.flash('error', 'Gagal memuat dashboard.');
        return res.redirect('/admin');
    }
};

/* -------------------------
   EVENTS
   ------------------------- */
exports.renderCreateEvent = async (req, res) => {
    try {
        const sports = await loadSportsList();
        const [venues] = await db.query('SELECT id, name FROM venues ORDER BY name');
        res.render('subadmin/create_event', { sports, venues });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Gagal memuat form event.');
        res.redirect('back');
    }
};

exports.createEvent = async (req, res) => {
    try {
        const { sport_id, title, slug, description, start_date, end_date, venue_id } = req.body;
        // check assigned sport if subadmin
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1', [req.session.user.id, sport_id]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return res.redirect('back'); }
        }
        await db.query(
            `INSERT INTO events (sport_id, title, slug, description, start_date, end_date, venue_id, organizer_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', NOW(), NOW())`,
            [sport_id, title, slug, description, start_date, end_date || null, venue_id || null, req.session.user.id]
        );
        req.flash('success', 'Event berhasil dibuat.');
        return res.redirect('/admin'); // or /subadmin/events
    } catch (err) {
        console.error('createEvent', err);
        req.flash('error', 'Gagal membuat event.');
        return res.redirect('back');
    }
};

/* -------------------------
   NEWS / ARTICLES
   ------------------------- */
exports.renderCreateNews = async (req, res) => {
    const sports = await loadSportsList();
    res.render('subadmin/create_news', { sports });
};

exports.createNews = async (req, res) => {
    try {
        const { sport_id, event_id, title, slug, excerpt, content, status, published_at } = req.body;
        // assigned check
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1', [req.session.user.id, sport_id]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return res.redirect('back'); }
        }
        await db.query(
            `INSERT INTO news_articles (sport_id, event_id, author_id, title, slug, excerpt, content, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [sport_id || null, event_id || null, req.session.user.id, title, slug, excerpt || null, content || '', status || 'draft', published_at || null]
        );
        req.flash('success', 'Berita berhasil dibuat.');
        return res.redirect('/admin');
    } catch (err) {
        console.error('createNews', err);
        req.flash('error', 'Gagal membuat berita.');
        return res.redirect('back');
    }
};

/* -------------------------
   MATCHES (schedule)
   ------------------------- */
exports.renderCreateMatch = async (req, res) => {
    const sports = await loadSportsList();
    const [teams] = await db.query('SELECT id, name, sport_id FROM teams ORDER BY name');
    const [venues] = await db.query('SELECT id, name FROM venues ORDER BY name');
    res.render('subadmin/create_match', { sports, teams, venues });
};

exports.createMatch = async (req, res) => {
    try {
        const { event_id, sport_id, home_team_id, away_team_id, title, start_time, end_time, venue_id } = req.body;
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1', [req.session.user.id, sport_id]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return res.redirect('back'); }
        }
        await db.query(
            `INSERT INTO matches (event_id, sport_id, home_team_id, away_team_id, title, start_time, end_time, venue_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', NOW(), NOW())`,
            [event_id || null, sport_id, home_team_id || null, away_team_id || null, title || null, start_time, end_time || null, venue_id || null]
        );
        req.flash('success', 'Match berhasil dibuat.');
        return res.redirect('/admin');
    } catch (err) {
        console.error('createMatch', err);
        req.flash('error', 'Gagal membuat match.');
        return res.redirect('back');
    }
};

/* -------------------------
   MATCH SCORES
   ------------------------- */
exports.addMatchScore = async (req, res) => {
    try {
        const matchId = Number(req.params.id);
        const { period, home_score, away_score } = req.body;
        // optional: verify subadmin owns sport
        const [mRows] = await db.query('SELECT sport_id FROM matches WHERE id = ? LIMIT 1', [matchId]);
        if (!mRows.length) { req.flash('error', 'Match tidak ditemukan'); return res.redirect('back'); }
        const sportId = mRows[0].sport_id;
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1', [req.session.user.id, sportId]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return res.redirect('back'); }
        }
        await db.query('INSERT INTO match_scores (match_id, period, home_score, away_score, created_at) VALUES (?, ?, ?, ?, NOW())', [matchId, period, home_score || 0, away_score || 0]);
        // update match aggregate (optional)
        await db.query('UPDATE matches SET home_score = home_score + ?, away_score = away_score + ?, updated_at = NOW() WHERE id = ?', [Number(home_score) || 0, Number(away_score) || 0, matchId]);
        req.flash('success', 'Score ditambahkan.');
        return res.redirect('back');
    } catch (err) {
        console.error('addMatchScore', err);
        req.flash('error', 'Gagal menambahkan score.');
        return res.redirect('back');
    }
};

/* -------------------------
   VIDEOS (VOD/highlight) - NOT livestream
   ------------------------- */
exports.renderCreateVideo = async (req, res) => {
    const sports = await loadSportsList();
    res.render('subadmin/create_video', { sports });
};

exports.createVideo = async (req, res) => {
    try {
        const { sport_id, event_id, match_id, title, type, platform, url, start_time, end_time } = req.body;
        if (type === 'livestream') {
            req.flash('error', 'Gunakan form livestream untuk menambahkan live stream.');
            return res.redirect('back');
        }
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1', [req.session.user.id, sport_id]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return res.redirect('back'); }
        }
        await db.query(
            `INSERT INTO videos (sport_id, event_id, match_id, title, type, platform, url, start_time, end_time, is_live, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
            [sport_id || null, event_id || null, match_id || null, title, type, platform || null, url, start_time || null, end_time || null]
        );
        req.flash('success', 'Video berhasil ditambahkan.');
        return res.redirect('/admin');
    } catch (err) {
        console.error('createVideo', err);
        req.flash('error', 'Gagal menambahkan video.');
        return res.redirect('back');
    }
};

/* -------------------------
   LIVESTREAMS (separate)
   ------------------------- */
exports.renderCreateLivestream = async (req, res) => {
    const sports = await loadSportsList();
    res.render('subadmin/create_livestream', { sports });
};

exports.createLivestream = async (req, res) => {
    try {
        const { sport_id, event_id, match_id, title, platform, url, start_time, end_time } = req.body;
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1', [req.session.user.id, sport_id]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return res.redirect('back'); }
        }
        await db.query(
            `INSERT INTO livestreams (sport_id, event_id, match_id, title, platform, url, start_time, end_time, is_live, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
            [sport_id || null, event_id || null, match_id || null, title, platform || null, url, start_time || null, end_time || null]
        );
        req.flash('success', 'Livestream berhasil dibuat.');
        return res.redirect('/admin');
    } catch (err) {
        console.error('createLivestream', err);
        req.flash('error', 'Gagal menambahkan livestream.');
        return res.redirect('back');
    }
};

/* -------------------------
   TICKET TYPES (per event or per match)
   ------------------------- */
exports.renderCreateTicketType = async (req, res) => {
    const [events] = await db.query('SELECT id, title FROM events ORDER BY start_date DESC');
    const [matches] = await db.query('SELECT id, title, start_time FROM matches ORDER BY start_time DESC');
    res.render('subadmin/create_ticket_type', { events, matches });
};

exports.createTicketType = async (req, res) => {
    try {
        const { event_id, match_id, name, price, quota } = req.body;
        // choose associated sport check if needed (simpler: assume event/match association already restricts)
        await db.query(
            `INSERT INTO ticket_types (event_id, match_id, name, price, quota, sold, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())`,
            [event_id || null, match_id || null, name, parseFloat(price || 0), parseInt(quota || 0, 10)]
        );
        req.flash('success', 'Tipe tiket berhasil dibuat.');
        return res.redirect('/admin');
    } catch (err) {
        console.error('createTicketType', err);
        req.flash('error', 'Gagal membuat ticket type.');
        return res.redirect('back');
    }
};
