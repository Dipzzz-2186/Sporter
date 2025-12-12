// src/controllers/standings.controller.js
const db = require('../config/db');

exports.listStandings = async (req, res) => {
    try {
        const allowed = Array.isArray(req.allowedSports) ? req.allowedSports.map(Number) : [];

        // load sports list FIRST (untuk dropdown)
        let sports = [];
        if (req.session.user.role === 'admin') {
            [sports] = await db.query(`SELECT id, name FROM sports ORDER BY name`);
        } else {
            if (allowed.length) {
                const ph = allowed.map(() => '?').join(',');
                [sports] = await db.query(`SELECT id, name FROM sports WHERE id IN (${ph}) ORDER BY name`, allowed);
            }
        }

        // baca sport_id dari query, kalau belum ada → NULL
        const qSport = req.query.sport_id ? Number(req.query.sport_id) : null;

        // kalau belum pilih cabang → tampilkan halaman normal tapi standings kosong
        if (!qSport) {
            return res.render('subadmin/standings', {
                title: 'Klasemen',
                standings: [],
                sports
            });
        }

        // cek apakah subadmin boleh akses cabang ini
        if (req.session.user.role === 'subadmin' && !allowed.includes(qSport)) {
            req.flash('error', 'Akses ditolak');
            return res.redirect('/subadmin/standings');
        }

        // load standings untuk cabang yang dipilih
        const [rows] = await db.query(`
      SELECT 
        s.id, s.sport_id,
        sp.name AS sport_name,
        s.team_id, t.name AS team_name,
        s.played, s.win, s.draw, s.loss,
        s.goals_for, s.goals_against,
        (s.goals_for - s.goals_against) AS goal_diff,
        s.pts
      FROM standings s
      LEFT JOIN sports sp ON sp.id = s.sport_id
      LEFT JOIN teams t ON t.id = s.team_id
      WHERE s.sport_id = ?
      ORDER BY s.pts DESC, goal_diff DESC, s.goals_for DESC
    `, [qSport]);

        return res.render('subadmin/standings', {
            title: 'Klasemen',
            standings: rows,
            sports,
            query: req.query
        });

    } catch (err) {
        console.error('listStandings error', err);
        req.flash('error', 'Gagal memuat klasemen.');
        return res.redirect('/subadmin');
    }
};

exports.addWin = async (req, res) => {
    const id = req.params.id;

    // ambil sport_id dulu
    const [[row]] = await db.query(`SELECT sport_id FROM standings WHERE id = ? LIMIT 1`, [id]);
    const sportId = row?.sport_id || '';

    await db.query(`
        UPDATE standings 
        SET win = win + 1, played = played + 1, pts = pts + 3 
        WHERE id = ?
    `, [id]);

    return res.redirect(`/subadmin/standings?sport_id=${sportId}`);
};

exports.addLoss = async (req, res) => {
    const id = req.params.id;

    const [[row]] = await db.query(`SELECT sport_id FROM standings WHERE id = ? LIMIT 1`, [id]);
    const sportId = row?.sport_id || '';

    await db.query(`
        UPDATE standings 
        SET loss = loss + 1, played = played + 1
        WHERE id = ?
    `, [id]);

    return res.redirect(`/subadmin/standings?sport_id=${sportId}`);
};
