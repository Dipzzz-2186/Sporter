// src/controllers/subadmin.controller.js
const db = require('../config/db');
const { parseYouTubeEmbed } = require('../utils/media.util'); // helper below

// helper yang menerima user (req.session.user)
async function loadSportsList(user) {
    if (!user) {
        const [sports] = await db.query('SELECT id, name FROM sports ORDER BY name');
        return sports;
    }

    if (user.role === 'admin') {
        const [sports] = await db.query('SELECT id, name FROM sports ORDER BY name');
        return sports;
    }

    // subadmin -> hanya sports yang ter-assign
    const [rows] = await db.query(
        `SELECT s.id, s.name
     FROM sports s
     JOIN user_sports us ON us.sport_id = s.id
     WHERE us.user_id = ?
     ORDER BY s.name`,
        [user.id]
    );
    return rows;
}

function safeRedirectBack(req, res, fallback = '/subadmin') {
    const ref = req.get('Referrer') || req.get('Referer') || '';
    if (ref && typeof ref === 'string' && ref.trim() !== '') {
        return res.redirect(ref);
    }
    return res.redirect(fallback);
}

// ---- DB schema helpers (biar code aman walau kolom/tabel baru belum ada)
async function tableExists(tableName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function columnExists(tableName, columnName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function getSportMetaById(sportId) {
  if (!sportId) return null;
  const [[s]] = await db.query('SELECT id, name, slug FROM sports WHERE id = ? LIMIT 1', [sportId]);
  return s || null;
}

async function getExpectedTeamSizeForMode(sportId, matchMode) {
  if (matchMode === 'individual') return 1;

  const hasTeamSize = await columnExists('sports', 'team_size');
  if (hasTeamSize) {
    const [[s]] = await db.query('SELECT team_size FROM sports WHERE id = ? LIMIT 1', [sportId]);
    const n = Number(s?.team_size || 0);
    if (n > 0) return n;
  }

  // fokus sekarang: PADEL default doubles 2 orang
  const sport = await getSportMetaById(sportId);
  const slug = String(sport?.slug || '').toLowerCase();
  const name = String(sport?.name || '').toLowerCase();
  const isPadel = slug === 'padel' || name.includes('padel');
  if (isPadel) return 2;

  return 2;
}

async function validateCompetitorForMode({ sportId, competitorTeamId, matchMode }) {
  if (!competitorTeamId) throw new Error('Kompetitor wajib dipilih.');

  const hasIsIndividual = await columnExists('teams', 'is_individual');

  // ambil team
  let team = null;
  if (hasIsIndividual) {
    const [[row]] = await db.query(
      'SELECT id, sport_id, name, is_individual FROM teams WHERE id = ? LIMIT 1',
      [competitorTeamId]
    );
    team = row;
    if (!team) throw new Error('Kompetitor tidak ditemukan.');

    // validasi mode vs is_individual
    const expectedIsIndividual = matchMode === 'individual' ? 1 : 0;
    if (Number(team.is_individual) !== expectedIsIndividual) {
      throw new Error(
        matchMode === 'individual'
          ? 'Mode INDIVIDUAL butuh peserta single (is_individual=1).'
          : 'Mode TEAM butuh tim (is_individual=0).'
      );
    }

    if (sportId && Number(team.sport_id) !== Number(sportId)) {
      throw new Error('Kompetitor tidak sesuai cabang olahraga yang dipilih.');
    }
  }

  // hitung roster dari athletes (ini roster kamu)
  // hitung roster dari team_members
  const [[c]] = await db.query(
    'SELECT COUNT(*) AS member_count FROM team_members WHERE team_id = ?',
    [competitorTeamId]
  );
  const memberCount = Number(c?.member_count || 0);

  // ✅ STRICT RULES
  if (matchMode === 'individual') {
    // cukup cek is_individual=1 (udah lu cek di atas)
    // roster tidak perlu dicek
    return;
  }

  const expected = await getExpectedTeamSizeForMode(sportId, matchMode);
  if (memberCount !== expected) {
    throw new Error(`Tim wajib punya ${expected} anggota. Sekarang: ${memberCount}.`);
  }
}


// render dashboard untuk subadmin
exports.renderDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // 1) ambil sports yang di-assign ke subadmin (admin akan di-handle: jika admin, ambil semua sports)
      let sportFilterSql = '';
      const sportIds = Array.isArray(req.allowedSports) ? req.allowedSports : [];
      let assignedSports = [];
      try {
        if (req.session.user.role === 'admin') {
          // admin -> semua cabang
          const [allSports] = await db.query('SELECT id, name FROM sports ORDER BY name');
          assignedSports = allSports;
        } else if (sportIds.length) {
          const placeholdersForNames = sportIds.map(() => '?').join(',');
          const [rows] = await db.query(
            `SELECT id, name FROM sports WHERE id IN (${placeholdersForNames}) ORDER BY name`,
            sportIds
          );
          assignedSports = rows;
        } else {
          assignedSports = []; // tidak ada cabang
        }
      } catch (e) {
        console.error('failed to load assignedSports', e);
        assignedSports = [];
      }

      if (!sportIds || sportIds.length === 0) {
        // no assigned sports (subadmin tanpa sport) -> tampilkan dashboard kosong
        return res.render('subadmin/dashboard', {
          title: 'SubAdmin Dashboard - SPORTER',
          stats: { sports: 0, events: 0, matches: 0, videos: 0, livestreams: 0, ticketTypes: 0 },
          upcomingMatches: [],
          recentNews: [],
          recentVideos: [],
          upcomingLivestreams: [],
          assignedSports
        });
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

      // --- show ALL livestreams for allowed sports (admin = all) ---
      let upcomingLivestreams = [];
      try {
        if (req.session.user.role === 'admin') {
          const [rows] = await db.query(
            `
      SELECT v.id, v.title, v.start_time, v.is_live, v.created_at, s.name AS sport_name
      FROM videos v
      LEFT JOIN sports s ON s.id = v.sport_id
      WHERE v.type = 'livestream'
      ORDER BY COALESCE(v.start_time, v.created_at) DESC
      LIMIT 12
      `
          );
          upcomingLivestreams = rows;
        } else {
          // subadmin: only livestreams for assigned sports
          const placeholders = sportIds.map(() => '?').join(',');
          const [rows] = await db.query(
            `
      SELECT v.id, v.title, v.start_time, v.is_live, v.created_at, s.name AS sport_name
      FROM videos v
      LEFT JOIN sports s ON s.id = v.sport_id
      WHERE v.type = 'livestream'
        AND s.id IN (${placeholders})
      ORDER BY COALESCE(v.start_time, v.created_at) DESC
      LIMIT 12
      `,
            [...sportIds]
          );
          upcomingLivestreams = rows;
        }
      } catch (e) {
        console.error('failed to load livestreams for dashboard', e);
        upcomingLivestreams = [];
      }

      return res.render('subadmin/dashboard', {
        title: 'SubAdmin Dashboard - SPORTER',
        stats,
        upcomingMatches: mappedMatches,
        recentNews,
        recentVideos,
        upcomingLivestreams,
        assignedSports
      });
    } catch (err) {
        console.error('renderDashboard subadmin error', err);
        req.flash('error', 'Gagal memuat dashboard.');
        return res.redirect('/subadmin');
    }
};

/* -------------------------
   EVENTS
   ------------------------- */
exports.renderCreateEvent = async (req, res) => {
    try {
        const sports = await loadSportsList(req.session.user);
        const [venues] = await db.query('SELECT id, name FROM venues ORDER BY name');
        res.render('subadmin/create_event', { sports, venues });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Gagal memuat form event.');
        return safeRedirectBack(req, res, '/subadmin');
    }
};

exports.createEvent = async (req, res) => {
    try {
        const { sport_id, title, slug, description, start_date, end_date, venue_id } = req.body;
        // check assigned sport if subadmin
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1', [req.session.user.id, sport_id]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return safeRedirectBack(req, res, '/subadmin'); }
        }
        await db.query(
            `INSERT INTO events (sport_id, title, slug, description, start_date, end_date, venue_id, organizer_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', NOW(), NOW())`,
            [sport_id, title, slug, description, start_date, end_date || null, venue_id || null, req.session.user.id]
        );
        req.flash('success', 'Event berhasil dibuat.');
        return res.redirect('/subadmin'); // or /subadmin/events
    } catch (err) {
        console.error('createEvent', err);
        req.flash('error', 'Gagal membuat event.');
        return safeRedirectBack(req, res, '/subadmin');
    }
};

/* -------------------------
   NEWS / ARTICLES
   ------------------------- */
exports.renderCreateNews = async (req, res) => {
    const sports = await loadSportsList(req.session.user);
    res.render('subadmin/create_news', { sports });
};

exports.createNews = async (req, res) => {
    try {
        const { sport_id, event_id, title, slug, excerpt, content, status, published_at } = req.body;
        // assigned check
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1', [req.session.user.id, sport_id]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return safeRedirectBack(req, res, '/subadmin'); }
        }
        await db.query(
            `INSERT INTO news_articles (sport_id, event_id, author_id, title, slug, excerpt, content, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [sport_id || null, event_id || null, req.session.user.id, title, slug, excerpt || null, content || '', status || 'draft', published_at || null]
        );
        req.flash('success', 'Berita berhasil dibuat.');
        return res.redirect('/subadmin');
    } catch (err) {
        console.error('createNews', err);
        req.flash('error', 'Gagal membuat berita.');
        return safeRedirectBack(req, res, '/subadmin');
    }
};

/* -------------------------
   MATCHES (schedule)
   ------------------------- */
   function normalizeDateTime(value) {
  if (!value) return null;
  let v = String(value).trim();
  if (!v) return null;
  v = v.replace("T", " "); // dari datetime-local → "YYYY-MM-DD HH:MM"
  if (v.length === 16) v = v + ":00";
  return v;
}

exports.listMatches = async (req, res) => {
  try {
    const sportIds = Array.isArray(req.allowedSports) ? req.allowedSports : [];
    const { sport_id, order } = req.query;

    // 🔑 AMBIL SPORT LIST UNTUK FILTER (WAJIB)
    let sports = [];
    if (sportIds.length) {
      const placeholders = sportIds.map(() => "?").join(",");
      [sports] = await db.query(
        `SELECT id, name FROM sports WHERE id IN (${placeholders}) ORDER BY name`,
        sportIds
      );
    }

    // ❗ JANGAN RETURN TANPA sports
    if (!sportIds.length) {
      return res.render("subadmin/matches", {
        title: "Kelola Pertandingan - Subadmin",
        matches: [],
        sports: [],
        query: req.query
      });
    }

    // ==== FILTER & SORT ====
    let where = [`m.sport_id IN (${sportIds.map(() => "?").join(",")})`];
    let params = [...sportIds];

    if (sport_id) {
      where.push("m.sport_id = ?");
      params.push(sport_id);
    }

    const orderSql =
          order === "oldest"
            ? "ORDER BY m.created_at ASC"
            : "ORDER BY m.created_at DESC";

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [matches] = await db.query(
      `
      SELECT
        m.id, m.title, m.start_time, m.end_time, m.status,
        m.match_mode,
        s.name AS sport_name,
        v.name AS venue_name,
        e.title AS event_title,
        ht.name AS home_team_name,
        at.name AS away_team_name,
        (
          SELECT GROUP_CONCAT(a.name ORDER BY mp.position SEPARATOR ' vs ')
          FROM match_participants mp
          JOIN athletes a ON a.id = mp.athlete_id
          WHERE mp.match_id = m.id
        ) AS participants_names
      FROM matches m
      LEFT JOIN sports s ON s.id = m.sport_id
      LEFT JOIN venues v ON v.id = m.venue_id
      LEFT JOIN events e ON e.id = m.event_id
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      ${whereSql}
      ${orderSql}
      `,
      params
    );


    return res.render("subadmin/matches", {
      title: "Kelola Pertandingan - Subadmin",
      matches,
      sports,
      query: req.query
    });

  } catch (err) {
    console.error("listMatches error", err);
    req.flash("error", "Gagal memuat daftar pertandingan.");
    return res.redirect("/subadmin");
  }
};

exports.renderCreateMatch = async (req, res) => {
  try {
    const sports = await loadSportsList(req.session.user);
    const allowedSportIds = (sports || []).map(s => Number(s.id)).filter(Boolean);

    const hasIsIndividual = await columnExists('teams', 'is_individual');

    // load teams hanya untuk cabang yang boleh user ini akses
    let teams = [];
    if (allowedSportIds.length) {
      const placeholders = allowedSportIds.map(() => '?').join(',');
      const sql = hasIsIndividual
        ? `SELECT id, name, sport_id, is_individual FROM teams WHERE sport_id IN (${placeholders}) ORDER BY name`
        : `SELECT id, name, sport_id FROM teams WHERE sport_id IN (${placeholders}) ORDER BY name`;
      const [rows] = await db.query(sql, allowedSportIds);
      teams = rows;
    }

    // ✅ load athletes utk dropdown mode individual
    let athletes = [];
    if (allowedSportIds.length) {
      const placeholders = allowedSportIds.map(() => '?').join(',');

      const hasMemberType = await columnExists('athletes', 'member_type');

      const sql = hasMemberType
        ? `SELECT id, sport_id, name, member_type
          FROM athletes
          WHERE sport_id IN (${placeholders})
            AND LOWER(member_type) = 'individual'
          ORDER BY name`
        : `SELECT id, sport_id, name
          FROM athletes
          WHERE sport_id IN (${placeholders})
          ORDER BY name`;

      const [rows] = await db.query(sql, allowedSportIds);
      athletes = rows;
    }


    const [venues] = await db.query('SELECT id, name FROM venues ORDER BY name');

    const match_mode =
      (req.query.match_mode || req.query.mode || '').toLowerCase() === 'individual'
        ? 'individual'
        : 'team';

    return res.render('subadmin/create_match', {
      title: 'Tambah Pertandingan',
      sports,
      teams,
      athletes,       // ✅ kirim ke pug
      venues,
      match_mode,
      hasIsIndividual,
    });
  } catch (err) {
    console.error('renderCreateMatch error', err);
    req.flash('error', 'Gagal memuat form pertandingan.');
    return res.redirect('/subadmin/matches');
  }
};

exports.createMatch = async (req, res) => {
  try {
    let {
      event_id,
      sport_id,
      home_team_id,
      away_team_id,
      title,
      start_time,
      end_time,
      venue_id,
      match_mode,
      participant_ids,

      // ===== TICKETING =====
      sell_ticket,
      ticket_name,
      ticket_price,
      ticket_quota,
      ticket_max_per_user,
    } = req.body;

    const maxPerUser = Math.max(1, Number(ticket_max_per_user || 1));
    title = (title || "").trim();
    const sportId = sport_id ? Number(sport_id) : null;
    const eventId = event_id ? Number(event_id) : null;
    let homeId = home_team_id ? Number(home_team_id) : null;
    let awayId = away_team_id ? Number(away_team_id) : null;
    const venueId = venue_id ? Number(venue_id) : null;

    const matchMode =
      String(match_mode || "").toLowerCase() === "individual" ? "individual" : "team";

    if (!sportId || !title || !start_time) {
      req.flash("error", "Cabang olahraga, judul, dan waktu mulai wajib diisi.");
      return res.redirect("/subadmin/matches/create");
    }
    // ===== VALIDASI TIKET =====
    if (Number(sell_ticket) === 1) {
      if (!ticket_name || !ticket_price || !ticket_quota) {
        req.flash("error", "Data tiket belum lengkap.");
        return res.redirect("/subadmin/matches/create");
      }

      if (Number(ticket_price) < 0) {
        req.flash("error", "Harga tiket tidak valid.");
        return res.redirect("/subadmin/matches/create");
      }

      if (Number(ticket_quota) < 1) {
        req.flash("error", "Kuota tiket minimal 1.");
        return res.redirect("/subadmin/matches/create");
      }
    }

    // ✅ KHUSUS INDIVIDUAL: home/away diambil dari TEAMS (is_individual=1)
    if (matchMode === "individual") {
      const ids = (Array.isArray(participant_ids) ? participant_ids : [participant_ids])
        .map(x => Number(x))
        .filter(Boolean);

      const unique = [...new Set(ids)];
      if (unique.length < 2) {
        req.flash("error", "Mode INDIVIDUAL butuh minimal 2 peserta.");
        return res.redirect("/subadmin/matches/create");
      }

      const placeholders = unique.map(() => "?").join(",");

      // ambil dari ATHLETES
      const [athRows] = await db.query(
        `SELECT id, sport_id, name, member_type
        FROM athletes
        WHERE id IN (${placeholders})`,
        unique
      );

      if (athRows.length !== unique.length) {
        req.flash("error", "Ada peserta (athlete) yang tidak ditemukan di database.");
        return res.redirect("/subadmin/matches/create");
      }

      for (const a of athRows) {
        if (Number(a.sport_id) !== Number(sportId)) {
          req.flash("error", `Peserta "${a.name}" bukan dari cabang olahraga yang dipilih.`);
          return res.redirect("/subadmin/matches/create");
        }
        if (String(a.member_type).toLowerCase() !== "individual") {
          req.flash("error", `Peserta "${a.name}" bukan member_type=individual.`);
          return res.redirect("/subadmin/matches/create");
        }
      }

      // urutan sesuai pilihan user
      const byOrder = unique.map(id => athRows.find(a => Number(a.id) === Number(id)));

      // ⚠️ homeId/awayId di matches itu sekarang konsepnya TEAM ID.
      // Kalau lu masih maksa simpen athlete di kolom home_team_id/away_team_id, itu jadi rancu.
      // Minimal: set null dulu biar gak nabrak validasi team.
      homeId = null;
      awayId = null;
    }



    // ✅ MODE TEAM tetap jalan seperti biasa (pakai home_team_id & away_team_id)
    if (matchMode === "team") {
    if (!homeId || !awayId) {
      req.flash("error", "Pilih tim Home dan Away.");
      return res.redirect("/subadmin/matches/create");
    }
    if (homeId === awayId) {
      req.flash("error", "Home dan Away tidak boleh sama.");
      return res.redirect("/subadmin/matches/create");
    }
  }
    // validasi competitor sesuai mode (kalau kolom/tabel barunya sudah ada)
    // ✅ bener: cuma TEAM
    if (matchMode === "team") {
      await validateCompetitorForMode({ sportId, competitorTeamId: homeId, matchMode });
      await validateCompetitorForMode({ sportId, competitorTeamId: awayId, matchMode });
    }
    const start = normalizeDateTime(start_time);
    const end = normalizeDateTime(end_time);

    const hasMatchMode = await columnExists("matches", "match_mode");
    const hasMP = await tableExists("match_participants");

    // === INSERT MATCH (ambil insertId) ===
    let matchId = null;

    if (hasMatchMode) {
      const [ins] = await db.query(
        `INSERT INTO matches
        (event_id, sport_id, home_team_id, away_team_id, title, start_time, end_time, venue_id, status, match_mode, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, NOW(), NOW())`,
        [eventId || null, sportId, homeId, awayId, title, start, end, venueId || null, matchMode]
      );
      matchId = ins.insertId;
    } else {
      const [ins] = await db.query(
        `INSERT INTO matches
        (event_id, sport_id, home_team_id, away_team_id, title, start_time, end_time, venue_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', NOW(), NOW())`,
        [eventId || null, sportId, homeId, awayId, title, start, end, venueId || null]
      );
      matchId = ins.insertId;
    }

    // === SIMPAN SEMUA PESERTA (INDIVIDUAL) ===
    // ===== INSERT TICKET TYPE (JIKA JUAL TIKET) =====
    if (Number(sell_ticket) === 1) {
      await db.query(
        `INSERT INTO ticket_types
   (match_id, event_id, name, price, quota, max_per_user, sold, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
        [
          matchId,
          eventId || null,
          ticket_name.trim(),
          Number(ticket_price),
          Number(ticket_quota),
          maxPerUser
        ]
      );
    }

    if (matchMode === "individual" && hasMP) {
      const ids = (Array.isArray(participant_ids) ? participant_ids : [participant_ids])
        .map(Number)
        .filter(Boolean);

      const unique = [...new Set(ids)];

      // posisi urut sesuai pilihan user
      const values = unique.map((teamId, idx) => [matchId, teamId, idx + 1]);
      const placeholders = values.map(() => "(?,?,?)").join(",");

      await db.query(
        `INSERT IGNORE INTO match_participants (match_id, athlete_id, position) VALUES ${placeholders}`,
        values.flat()
      );


      // standings untuk semua peserta biar aman
      for (const teamId of unique) {
        await db.query(
          `INSERT IGNORE INTO standings (sport_id, team_id, played, win, draw, loss, goals_for, goals_against, pts)
          VALUES (?, ?, 0,0,0,0,0,0,0)`,
          [sportId, teamId]
        );
      }
    } else {
      // TEAM mode: minimal home/away masuk standings
      await db.query(
        `INSERT IGNORE INTO standings (sport_id, team_id, played, win, draw, loss, goals_for, goals_against, pts)
        VALUES (?, ?, 0,0,0,0,0,0,0)`,
        [sportId, homeId]
      );
      await db.query(
        `INSERT IGNORE INTO standings (sport_id, team_id, played, win, draw, loss, goals_for, goals_against, pts)
        VALUES (?, ?, 0,0,0,0,0,0,0)`,
        [sportId, awayId]
      );
    }
    req.flash("success", "Pertandingan berhasil dibuat.");
    return res.redirect("/subadmin/matches");
  } catch (err) {
    console.error("createMatch error >>>", err);
    req.flash("error", err?.message || "Gagal membuat pertandingan.");
    return res.redirect("/subadmin/matches/create");
  }
};


exports.renderEditMatch = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID pertandingan tidak valid.");
      return res.redirect("/subadmin/matches");
    }

    const [[match]] = await db.query(`SELECT * FROM matches WHERE id = ? LIMIT 1`, [id]);
    if (!match) {
      req.flash("error", "Pertandingan tidak ditemukan.");
      return res.redirect("/subadmin/matches");
    }

    // cek akses sport
    if (req.session.user.role === "subadmin") {
      const [rows] = await db.query(
        "SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1",
        [req.session.user.id, match.sport_id]
      );
      if (!rows.length) {
        req.flash("error", "Akses ditolak untuk pertandingan ini.");
        return res.redirect("/subadmin/matches");
      }
    }

    const sports = await loadSportsList(req.session.user);

    const hasIsIndividual = await columnExists("teams", "is_individual");
    const sqlTeams = hasIsIndividual
      ? "SELECT id, name, sport_id, is_individual FROM teams WHERE sport_id = ? ORDER BY name"
      : "SELECT id, name, sport_id FROM teams WHERE sport_id = ? ORDER BY name";
    const [teams] = await db.query(sqlTeams, [match.sport_id]);

    const [venues] = await db.query("SELECT id, name FROM venues ORDER BY name");

    return res.render("subadmin/edit_match", {
      title: "Edit Pertandingan",
      match,
      sports,
      teams,
      venues,
      hasIsIndividual,
    });
  } catch (err) {
    console.error("renderEditMatch error", err);
    req.flash("error", "Gagal memuat form edit pertandingan.");
    return res.redirect("/subadmin/matches");
  }
};

exports.updateMatch = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID pertandingan tidak valid.");
      return res.redirect("/subadmin/matches");
    }

    let {
      event_id,
      sport_id,
      home_team_id,
      away_team_id,
      title,
      start_time,
      end_time,
      venue_id,
      status,
      match_mode,
    } = req.body;

    title = (title || "").trim();
    const sportId = sport_id ? Number(sport_id) : null;
    const eventId = event_id ? Number(event_id) : null;
    const homeId = home_team_id ? Number(home_team_id) : null;
    const awayId = away_team_id ? Number(away_team_id) : null;
    const venueId = venue_id ? Number(venue_id) : null;

    const matchMode = String(match_mode || "").toLowerCase() === "individual" ? "individual" : "team";

    if (!sportId || !title || !start_time) {
      req.flash("error", "Cabang olahraga, judul, dan waktu mulai wajib diisi.");
      return res.redirect(`/subadmin/matches/${id}/edit`);
    }

    // wajib 2 competitor
    if (!homeId || !awayId) {
      req.flash("error", "Pilih peserta/tim Home dan Away.");
      return res.redirect(`/subadmin/matches/${id}/edit`);
    }
    if (homeId === awayId) {
      req.flash("error", "Home dan Away tidak boleh sama.");
      return res.redirect(`/subadmin/matches/${id}/edit`);
    }

    if (!status) status = "scheduled";

    // cek akses sport
    if (req.session.user.role === "subadmin") {
      const [rows] = await db.query(
        "SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1",
        [req.session.user.id, sportId]
      );
      if (!rows.length) {
        req.flash("error", "Akses ditolak untuk cabang olahraga ini.");
        return res.redirect("/subadmin/matches");
      }
    }

    // validasi competitor sesuai mode (aktif kalau kolom/tabel baru sudah ada)
    if (matchMode === "team") {
      await validateCompetitorForMode({ sportId, competitorTeamId: homeId, matchMode });
      await validateCompetitorForMode({ sportId, competitorTeamId: awayId, matchMode });
    }
    const start = normalizeDateTime(start_time);
    const end = normalizeDateTime(end_time);

    const hasMatchMode = await columnExists("matches", "match_mode");

    if (hasMatchMode) {
      await db.query(
        `UPDATE matches
         SET event_id = ?, sport_id = ?, home_team_id = ?, away_team_id = ?,
             title = ?, start_time = ?, end_time = ?, venue_id = ?, status = ?,
             match_mode = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          eventId || null,
          sportId,
          homeId,
          awayId,
          title,
          start,
          end,
          venueId || null,
          status,
          matchMode,
          id,
        ]
      );
    } else {
      await db.query(
        `UPDATE matches
         SET event_id = ?, sport_id = ?, home_team_id = ?, away_team_id = ?,
             title = ?, start_time = ?, end_time = ?, venue_id = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          eventId || null,
          sportId,
          homeId,
          awayId,
          title,
          start,
          end,
          venueId || null,
          status,
          id,
        ]
      );
    }

    // pastiin standings ada (biar klasemen aman)
    await db.query(
      `INSERT IGNORE INTO standings (sport_id, team_id, played, win, draw, loss, goals_for, goals_against, pts)
       VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`,
      [sportId, homeId]
    );
    await db.query(
      `INSERT IGNORE INTO standings (sport_id, team_id, played, win, draw, loss, goals_for, goals_against, pts)
       VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`,
      [sportId, awayId]
    );

    req.flash("success", "Pertandingan berhasil diupdate.");
    return res.redirect("/subadmin/matches");
  } catch (err) {
    console.error("updateMatch error", err);
    req.flash("error", err?.message || "Gagal mengupdate pertandingan.");
    return res.redirect("/subadmin/matches");
  }
};


exports.deleteMatch = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      req.flash("error", "ID pertandingan tidak valid.");
      return res.redirect("/subadmin/matches");
    }

    // opsional: cek sport/akses dulu kalau mau ekstra aman
    await db.query("DELETE FROM matches WHERE id = ?", [id]);

    req.flash("success", "Pertandingan berhasil dihapus.");
    return res.redirect("/subadmin/matches");
  } catch (err) {
    console.error("deleteMatch error", err);
    req.flash("error", "Gagal menghapus pertandingan.");
    return res.redirect("/subadmin/matches");
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
        if (!mRows.length) { req.flash('error', 'Match tidak ditemukan'); return safeRedirectBack(req, res, '/subadmin'); }
        const sportId = mRows[0].sport_id;
        if (req.session.user.role === 'subadmin') {
            const [rows] = await db.query('SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1', [req.session.user.id, sportId]);
            if (rows.length === 0) { req.flash('error', 'Akses ditolak'); return safeRedirectBack(req, res, '/subadmin'); }
        }
        await db.query('INSERT INTO match_scores (match_id, period, home_score, away_score, created_at) VALUES (?, ?, ?, ?, NOW())', [matchId, period, home_score || 0, away_score || 0]);
        // update match aggregate (optional)
        await db.query('UPDATE matches SET home_score = home_score + ?, away_score = away_score + ?, updated_at = NOW() WHERE id = ?', [Number(home_score) || 0, Number(away_score) || 0, matchId]);
        req.flash('success', 'Score ditambahkan.');
        return safeRedirectBack(req, res, '/subadmin');
    } catch (err) {
        console.error('addMatchScore', err);
        req.flash('error', 'Gagal menambahkan score.');
        return safeRedirectBack(req, res, '/subadmin');
    }
};

/* -------------------------
   VIDEOS (VOD/highlight) - NOT livestream
   ------------------------- */
/* -------------------------
   VIDEOS (VOD/highlight) - NOT livestream
   ------------------------- */
exports.renderCreateVideo = async (req, res) => {
  try {
    const sports = await loadSportsList(req.session.user);
    return res.render("subadmin/create_video", {
      title: "Tambah Video - Subadmin",
      sports,
    });
  } catch (err) {
    console.error("renderCreateVideo error", err);
    req.flash("error", "Gagal memuat form video.");
    return res.redirect("/subadmin");
  }
};


exports.createVideo = async (req, res) => {
  try {
    const {
      sport_id,
      event_id,
      match_id,
      title,
      type,
      platform,
      url,
      start_time,
      end_time,
    } = req.body;

    // Validasi basic
    if (!sport_id || !title || !type || !url) {
      req.flash(
        "error",
        "Cabang olahraga, judul, tipe, dan URL wajib diisi."
      );
      return res.redirect("/subadmin/videos/create");
    }

    // Form ini khusus VOD / Highlight, bukan livestream
    if (type === "livestream") {
      req.flash(
        "error",
        "Untuk livestream, gunakan form khusus livestream."
      );
      return res.redirect("/subadmin/livestreams/create");
    }

    // Cek hak akses subadmin ke sport_id
    if (req.session.user && req.session.user.role === "subadmin") {
      const [rows] = await db.query(
        "SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1",
        [req.session.user.id, sport_id]
      );
      if (rows.length === 0) {
        req.flash(
          "error",
          "Akses ditolak. Kamu tidak punya izin untuk cabang olahraga ini."
        );
        return res.redirect("/subadmin/videos/create");
      }
    }

    // Insert ke tabel videos
    await db.query(
      `INSERT INTO videos 
       (sport_id, event_id, match_id, title, type, platform, url, start_time, end_time, is_live, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [
        sport_id || null,
        event_id || null,
        match_id || null,
        title,
        type,
        platform || null,
        url,
        start_time || null,
        end_time || null,
      ]
    );

    req.flash("success", "Video berhasil ditambahkan.");
    return res.redirect("/subadmin");
  } catch (err) {
    console.error("createVideo error", err);
    req.flash("error", "Gagal menambahkan video. Cek input dan coba lagi.");
    return res.redirect("/subadmin/videos/create");
  }
};


/* -------------------------
   LIVESTREAMS (separate)
   ------------------------- */
function getYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}
exports.renderCreateLivestream = async (req, res) => {
    const sports = await loadSportsList(req.session.user);
    res.render('subadmin/create_livestream', { sports });
};

exports.createLivestream = async (req, res) => {
    try {
        const { sport_id, title, url, description } = req.body;

        if (!title || !url) {
            req.flash('error', 'Title dan URL wajib diisi.');
            return res.redirect('/subadmin/livestreams/create');
        }

        // permission check for subadmin
        if (req.session.user.role === 'subadmin') {
            const [ok] = await db.query('SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1', [req.session.user.id, sport_id]);
            if (ok.length === 0) {
                req.flash('error', 'Akses ditolak untuk cabang olahraga ini.');
                return res.redirect('/subadmin/livestreams/create');
            }
        }

        // parse embed URL (use let so we can reassign)
        let embedUrl = parseYouTubeEmbed(url);

        if (!embedUrl) {
            // try clean input (strip tags, quotes)
            const cleaned = String(url).replace(/<[^>]*>/g, '').replace(/['"`\u2018\u2019\u201C\u201D]/g, '').trim();
            embedUrl = parseYouTubeEmbed(cleaned);
            if (!embedUrl) {
                req.flash('error', 'URL tidak dikenali atau belum didukung. Gunakan link YouTube atau paste iframe embed.');
                return res.redirect('/subadmin/livestreams/create');
            }
        }

        // extract id for thumbnail
        const idMatch = embedUrl.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
        const ytId = idMatch ? idMatch[1] : null;
        const thumbnail_url = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
        const platform = ytId ? 'youtube' : null;

        // Insert into videos table as 'livestream'
        await db.query(
            `INSERT INTO videos (sport_id, event_id, match_id, title, type, platform, url, thumbnail_url, description, start_time, end_time, is_live, created_at, updated_at)
       VALUES (?, NULL, NULL, ?, 'livestream', ?, ?, ?, NULL, NULL, NULL, 0, NOW(), NOW())`,
            [sport_id || null, title, platform, url, thumbnail_url, description || null]
        );

        req.flash('success', 'Livestream berhasil dibuat.');
        return res.redirect('/livestreams');
    } catch (err) {
        console.error('createLivestream error', err);
        req.flash('error', 'Gagal menambahkan livestream. Cek server log.');
        return res.redirect('/subadmin/livestreams/create');
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
        return res.redirect('/subadmin');
    } catch (err) {
        console.error('createTicketType', err);
        req.flash('error', 'Gagal membuat ticket type.');
        return safeRedirectBack(req, res, '/subadmin');
    }
};
// Subadmin — listNews (tambahkan sebelum exports.renderCreateNews atau di bagian NEWS)
exports.listNews = async (req, res) => {
  try {
    const sportIds = Array.isArray(req.allowedSports) ? req.allowedSports : [];

    // Jika admin: boleh lihat semua (termasuk global null)
    if (req.session.user.role === 'admin') {
      const [news] = await db.query(
        `SELECT n.id, n.title, n.slug, n.status, n.published_at, s.name as sport_name
         FROM news_articles n
         LEFT JOIN sports s ON s.id = n.sport_id
         ORDER BY n.published_at DESC, n.created_at DESC
         LIMIT 100`
      );
      return res.render('subadmin/news', { title: 'Berita - SubAdmin', news });
    }

    // subadmin: hanya sport yang di-assign
    if (!sportIds.length) {
      return res.render('subadmin/news', { title: 'Berita - SubAdmin', news: [] });
    }

    const placeholders = sportIds.map(() => '?').join(',');
    const sql = `
      SELECT n.id, n.title, n.slug, n.status, n.published_at, s.name as sport_name
      FROM news_articles n
      LEFT JOIN sports s ON s.id = n.sport_id
      WHERE n.sport_id IN (${placeholders})
      ORDER BY n.published_at DESC, n.created_at DESC
      LIMIT 100
    `;
    const [news] = await db.query(sql, sportIds);
    return res.render('subadmin/news', { title: 'Berita - SubAdmin', news });
  } catch (err) {
    console.error('subadmin.listNews error', err);
    req.flash('error', 'Gagal memuat daftar berita.');
    return res.redirect('/subadmin');
  }
};

// render edit using the same create_news view (mode='edit')
exports.renderEditNews = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) { req.flash('error', 'ID berita tidak valid'); return safeRedirectBack(req, res, '/subadmin/news'); }

        const [[article]] = await db.query('SELECT * FROM news_articles WHERE id = ? LIMIT 1', [id]);
        if (!article) { req.flash('error', 'Berita tidak ditemukan'); return safeRedirectBack(req, res, '/subadmin/news'); }

        // permission: if subadmin, ensure they own the sport (if article has sport_id)
        if (req.session.user.role === 'subadmin' && article.sport_id) {
            const [ok] = await db.query('SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1', [req.session.user.id, article.sport_id]);
            if (!ok.length) { req.flash('error', 'Akses ditolak'); return safeRedirectBack(req, res, '/subadmin/news'); }
        }

        const sports = await loadSportsList(req.session.user);
        const [events] = await db.query('SELECT id, title, sport_id FROM events ORDER BY start_date DESC');

        // render the existing create_news view but with mode edit
        return res.render('subadmin/create_news', {
            title: 'Edit Berita',
            mode: 'edit',
            article,
            sports,
            events
        });
    } catch (err) {
        console.error('renderEditNews', err);
        req.flash('error', 'Gagal memuat form edit berita.');
        return safeRedirectBack(req, res, '/subadmin/news');
    }
};

// helper: simple slugify
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // hapus accent
    .replace(/[^\w\s-]/g, '') // hapus karakter spesial
    .replace(/\s+/g, '-')      // spasi jadi dash
    .replace(/-+/g, '-')       // multiple dash jadi satu
    .replace(/^-+|-+$/g, '');  // hapus dash di awal/akhir
}
exports.updateNews = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) { req.flash('error', 'ID tidak valid'); return safeRedirectBack(req, res, '/subadmin/news'); }

        const thumbnailFile = req.file;
        const {
            sport_id,
            event_id,
            title = '',
            slug: incomingSlug,
            excerpt,
            content,
            status = 'draft',
            published_at
        } = req.body || {};

        // ensure title present
        if (!title || !String(title).trim()) {
            req.flash('error', 'Judul wajib diisi.');
            return safeRedirectBack(req, res, '/subadmin/news');
        }

        // fetch article for permission/existing values
        const [[article]] = await db.query('SELECT * FROM news_articles WHERE id = ? LIMIT 1', [id]);
        if (!article) { req.flash('error', 'Berita tidak ditemukan'); return safeRedirectBack(req, res, '/subadmin/news'); }

        // permission: subadmin must be assigned to sport
        if (req.session.user.role === 'subadmin' && sport_id) {
            const [ok] = await db.query('SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1', [req.session.user.id, sport_id]);
            if (!ok.length) { req.flash('error', 'Akses ditolak'); return safeRedirectBack(req, res, '/subadmin/news'); }
        }

        // build slug: prefer incomingSlug, else from title, ensure not empty
        let finalSlug = incomingSlug && String(incomingSlug).trim() ? slugify(incomingSlug) : slugify(title);
        if (!finalSlug) finalSlug = 'article-' + Date.now();

        // thumbnail path if uploaded, otherwise keep existing
        const thumbnailPath = thumbnailFile ? `/uploads/news/${thumbnailFile.filename}` : (article.thumbnail_url || null);

        await db.query(
            `UPDATE news_articles
       SET sport_id = ?, event_id = ?, title = ?, slug = ?, excerpt = ?, content = ?, status = ?, published_at = ?, thumbnail_url = ?, updated_at = NOW()
       WHERE id = ?`,
            [
                sport_id || null,
                event_id || null,
                title.trim(),
                finalSlug,
                excerpt || null,
                content || '',
                status || 'draft',
                published_at || null,
                thumbnailPath,
                id
            ]
        );

        req.flash('success', 'Berita berhasil disimpan.');
        return res.redirect('/subadmin/news');
    } catch (err) {
        console.error('updateNews Error:', err);
        req.flash('error', 'Gagal mengupdate berita. Cek server log.');
        return safeRedirectBack(req, res, '/subadmin/news');
    }
};

exports.deleteNews = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) { req.flash('error', 'ID tidak valid'); return safeRedirectBack(req, res, '/subadmin/news'); }

        const [[article]] = await db.query('SELECT * FROM news_articles WHERE id = ? LIMIT 1', [id]);
        if (!article) { req.flash('error', 'Berita tidak ditemukan'); return safeRedirectBack(req, res, '/subadmin/news'); }

        if (req.session.user.role === 'subadmin' && article.sport_id) {
            const [ok] = await db.query('SELECT 1 FROM user_sports WHERE user_id = ? AND sport_id = ? LIMIT 1', [req.session.user.id, article.sport_id]);
            if (!ok.length) { req.flash('error', 'Akses ditolak'); return safeRedirectBack(req, res, '/subadmin/news'); }
        }

        await db.query('DELETE FROM news_articles WHERE id = ?', [id]);
        req.flash('success', 'Berita berhasil dihapus.');
        return safeRedirectBack(req, res, '/subadmin/news');
    } catch (err) {
        console.error('deleteNews', err);
        req.flash('error', 'Gagal menghapus berita.');
        return safeRedirectBack(req, res, '/subadmin/news');
    }
};
exports.ajaxCreateTeam = async (req, res) => {
  try {
    const { sport_id, name, short_name, city } = req.body;

    const sportId = sport_id ? Number(sport_id) : null;
    const teamName = (name || '').trim();

    if (!sportId || !teamName) {
      return res.status(400).json({ ok: false, message: 'sport_id dan name wajib diisi' });
    }

    // cek akses subadmin ke sport
    if (req.session.user.role === 'subadmin') {
      const [rows] = await db.query(
        'SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1',
        [req.session.user.id, sportId]
      );
      if (!rows.length) {
        return res.status(403).json({ ok: false, message: 'Akses ditolak untuk sport ini' });
      }
    }

    const [result] = await db.query(
      `INSERT INTO teams (sport_id, name, short_name, city, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [sportId, teamName, (short_name || null), (city || null)]
    );

    return res.json({
      ok: true,
      team: { id: result.insertId, name: teamName, sport_id: sportId }
    });
  } catch (err) {
    console.error('ajaxCreateTeam error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
};

exports.ajaxCreateAthlete = async (req, res) => {
  try {
    const sportId = Number(req.body.sport_id);
    const name = String(req.body.name || '').trim();
    const number = String(req.body.number || '').trim();
    const position = String(req.body.position || '').trim();
    const slug = generateSlug(name); // ✅ GENERATE SLUG
    
    if (!sportId || !name) {
      return res.status(400).json({ ok: false, message: 'Sport & nama wajib' });
    }

    // Cek akses subadmin ke sport
    if (req.session.user.role === 'subadmin') {
      const [rows] = await db.query(
        'SELECT 1 FROM user_sports WHERE user_id=? AND sport_id=? LIMIT 1',
        [req.session.user.id, sportId]
      );
      if (!rows.length) {
        return res.status(403).json({ ok: false, message: 'Akses ditolak untuk sport ini' });
      }
    }

    const hasMemberType = await columnExists('athletes', 'member_type');

    const [r] = await db.query(
      hasMemberType
        ? `INSERT INTO athletes (sport_id, name, slug, number, position, member_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'individual', NOW(), NOW())`
        : `INSERT INTO athletes (sport_id, name, slug, number, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [sportId, name, slug, number || null, position || null]
    );

    const insertedId = r.insertId;

    return res.json({
      ok: true,
      message: 'Pemain berhasil ditambahkan',
      athlete: {
        id: insertedId,
        sport_id: sportId,
        name,
        slug,  // ✅ KIRIM SLUG KE FRONTEND
        number: number || null,
        position: position || null,
        member_type: 'individual'
      }
    });
  } catch (e) {
    console.error('Error creating athlete:', e);
    
    // Handle duplicate slug
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        ok: false, 
        message: 'Nama pemain sudah ada, gunakan nama yang berbeda' 
      });
    }
    
    return res.status(500).json({ 
      ok: false, 
      message: 'Server error: ' + e.message 
    });
  }
};

// -------------------------
// TEAMS + TEAM MEMBERS
// -------------------------
async function assertCanAccessTeam(req, teamId) {
  const [[team]] = await db.query(
    `SELECT t.id, t.sport_id, t.name, s.name AS sport_name
     FROM teams t
     LEFT JOIN sports s ON s.id = t.sport_id
     WHERE t.id = ? LIMIT 1`,
    [teamId]
  );
  if (!team) throw new Error('Tim tidak ditemukan.');

  // admin bebas
  if (req.session.user.role === 'admin') return team;

  // subadmin: wajib sport_id termasuk allowedSports / user_sports
  const allowed = Array.isArray(req.allowedSports) ? req.allowedSports.map(Number) : [];
  if (!allowed.includes(Number(team.sport_id))) {
    throw new Error('Akses ditolak untuk tim ini (beda cabang olahraga).');
  }

  return team;
}

// GET /subadmin/teams
exports.listTeams = async (req, res) => {
  try {
    const allowed = Array.isArray(req.allowedSports) ? req.allowedSports.map(Number) : [];
    const hasIsIndividual = await columnExists('teams', 'is_individual');

    if (req.session.user.role === 'admin') {
      const [teams] = await db.query(
        `SELECT t.id, t.name, t.short_name, t.city, t.sport_id, s.name AS sport_name
         FROM teams t
         LEFT JOIN sports s ON s.id = t.sport_id
         WHERE 1=1
           ${hasIsIndividual ? 'AND (t.is_individual = 0 OR t.is_individual IS NULL)' : ''}
         ORDER BY s.name, t.name`
      );
      return res.render('subadmin/teams', { title: 'Kelola Tim', teams });
    }

    if (!allowed.length) return res.render('subadmin/teams', { title: 'Kelola Tim', teams: [] });

    const placeholders = allowed.map(() => '?').join(',');
    const [teams] = await db.query(
      `SELECT t.id, t.name, t.short_name, t.city, t.sport_id, s.name AS sport_name
       FROM teams t
       LEFT JOIN sports s ON s.id = t.sport_id
       WHERE t.sport_id IN (${placeholders})
         ${hasIsIndividual ? 'AND (t.is_individual = 0 OR t.is_individual IS NULL)' : ''}
       ORDER BY s.name, t.name`,
      allowed
    );

    return res.render('subadmin/teams', { title: 'Kelola Tim', teams });
  } catch (err) {
    console.error('listTeams error', err);
    req.flash('error', 'Gagal memuat daftar tim.');
    return res.redirect('/subadmin');
  }
};


// GET /subadmin/teams/:id/members
// GET /subadmin/teams/:id/members
exports.renderTeamMembers = async (req, res) => {
  try {
    const teamId = Number(req.params.id);

    const team = await assertCanAccessTeam(req, teamId);

    const [members] = await db.query(
      `SELECT
          tm.id,
          tm.athlete_id,
          a.name,
          tm.position,
          tm.number,
          tm.birth_date,
          tm.created_at
      FROM team_members tm
      JOIN athletes a ON a.id = tm.athlete_id
      WHERE tm.team_id = ?
      ORDER BY tm.created_at DESC`,
      [teamId]
    );


    return res.render('subadmin/team_members', {
      title: 'Kelola Anggota',
      team,
      members
    });
  } catch (err) {
    console.error('renderTeamMembers error', err);
    req.flash('error', err.message || 'Gagal memuat anggota tim.');
    return res.redirect('/subadmin/teams');
  }
};

// POST /subadmin/teams/:id/members
exports.addTeamMember = async (req, res) => {
  try {
    const teamId = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const position = String(req.body.position || '').trim();
    const number = String(req.body.number || '').trim();
    const birth_date = req.body.birth_date ? String(req.body.birth_date) : null;

    if (!teamId || !name) {
      req.flash('error', 'Nama anggota wajib diisi.');
      return res.redirect(`/subadmin/teams/${teamId}/members`);
    }

    // ambil team + sport_id
    const [[team]] = await db.query(`SELECT id, sport_id FROM teams WHERE id=? LIMIT 1`, [teamId]);
    if (!team) {
      req.flash('error', 'Tim tidak ditemukan.');
      return res.redirect('/subadmin/teams');
    }

    // 1) buat athlete
    await db.query(
      `INSERT INTO athletes (sport_id, name, member_type, created_at, updated_at)
      VALUES (?, ?, 'team', NOW(), NOW())`,
      [team.sport_id, name]
    );
    const athleteId = ins.insertId;

    // 2) link ke team_members
    await db.query(
      `INSERT INTO team_members (team_id, athlete_id, position, number, birth_date)
       VALUES (?, ?, ?, ?, ?)`,
      [teamId, athleteId, position || null, number || null, birth_date]
    );

    req.flash('success', 'Anggota berhasil ditambahkan.');
    return res.redirect(`/subadmin/teams/${teamId}/members`);
  } catch (err) {
    console.error('addTeamMember error', err);
    req.flash('error', 'Gagal menambahkan anggota.');
    return res.redirect(`/subadmin/teams/${req.params.id}/members`);
  }
};


// POST /subadmin/teams/:teamId/members/:memberId/delete
exports.deleteTeamMember = async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    const athleteId = Number(req.params.athleteId);

    // hapus relasi dulu
    await db.query(`DELETE FROM team_members WHERE team_id = ? AND athlete_id = ?`, [teamId, athleteId]);

    req.flash('success', 'Anggota berhasil dihapus.');
    return res.redirect(`/subadmin/teams/${teamId}/members`);
  } catch (err) {
    console.error('deleteTeamMember error', err);
    req.flash('error', 'Gagal menghapus anggota.');
    return res.redirect(`/subadmin/teams/${req.params.teamId}/members`);
  }
};


// ===============================
// SUBADMIN – LIST TICKET ORDERS (PER USER)
// ===============================
exports.renderTicketOrders = async (req, res) => {
  try {
    const user = req.session.user;
    const allowedSports = Array.isArray(req.allowedSports) ? req.allowedSports : [];
    const { sport_id } = req.query;

    let whereSport = '';
    let params = [];

    if (user.role === 'admin') {
      if (sport_id) {
        whereSport = 'AND s.id = ?';
        params.push(sport_id);
      }
    } else {
      if (!allowedSports.length) {
        return res.render('subadmin/ticket_orders', {
          orders: [],
          sports: [],
          selectedSport: null
        });
      }
      const placeholders = allowedSports.map(() => '?').join(',');
      whereSport = `AND s.id IN (${placeholders})`;
      params.push(...allowedSports);

      if (sport_id) {
        whereSport += ' AND s.id = ?';
        params.push(sport_id);
      }
    }

    const [sports] = await db.query(
      `SELECT id, name FROM sports ORDER BY name`
    );

    // 🔥 QUERY PER USER + SPORT
    const [orders] = await db.query(
      `
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        s.id AS sport_id,
        s.name AS sport_name,
        COUNT(t.id) AS total_qty,
        SUM(tt.price) AS total_price
      FROM orders o
      JOIN users u ON u.id = o.user_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      JOIN tickets t
        ON t.order_item_id = oi.id
      AND t.holder_name IS NOT NULL
      LEFT JOIN matches m ON m.id = tt.match_id
      LEFT JOIN events e ON e.id = tt.event_id
      JOIN sports s ON s.id = COALESCE(m.sport_id, e.sport_id)
      WHERE 1=1
      ${whereSport}
      GROUP BY u.id, s.id
      ORDER BY MAX(o.created_at) DESC
      `,
      params
    );

    res.render('subadmin/ticket_orders', {
      orders,
      sports,
      selectedSport: sport_id || ''
    });
  } catch (err) {
    console.error('renderTicketOrders error', err);
    req.flash('error', 'Gagal memuat order tiket');
    res.redirect('/subadmin');
  }
};
// ===============================
// SUBADMIN – DETAIL ORDER TIKET PER USER + SPORT
// ===============================
exports.renderTicketOrderDetail = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const sportId = Number(req.params.sportId);

    const [rows] = await db.query(
      `
      SELECT
        m.id AS match_id,
        m.title AS match_title,
        m.start_time,
        t.holder_name,
        tt.price
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN tickets t
        ON t.order_item_id = oi.id
      AND t.holder_name IS NOT NULL
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      JOIN matches m ON m.id = tt.match_id
      WHERE o.user_id = ?
        AND m.sport_id = ?
      ORDER BY m.start_time ASC
      `,
      [userId, sportId]
    );

    res.render('subadmin/ticket_order_detail', { rows });
  } catch (err) {
    console.error('renderTicketOrderDetail error', err);
    req.flash('error', 'Gagal memuat detail order');
    res.redirect('/subadmin/ticket-orders');
  }
};
