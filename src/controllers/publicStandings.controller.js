const db = require('../config/db');

exports.index = async (req, res) => {
  try {
    const [sports] = await db.query(`SELECT id, name FROM sports ORDER BY name`);

    const qSport = req.query.sport_id ? Number(req.query.sport_id) : null;
    const mode = (req.query.mode === 'individual') ? 'individual' : 'team';

    // kalau belum pilih sport
    if (!qSport) {
      return res.render('standings/index', {
        title: 'Klasemen',
        standings: [],
        sports,
        query: req.query,
        isPadel: false,
        mode
      });
    }

    // ambil sport
    const [[sport]] = await db.query(
      `SELECT id, name FROM sports WHERE id = ?`,
      [qSport]
    );

    const isPadel = !!sport && sport.name && sport.name.toLowerCase() === 'padel';

    if (!sport) {
      return res.render('standings/index', {
        title: 'Klasemen',
        standings: [],
        sports,
        query: req.query,
        isPadel: false,
        mode
      });
    }

    let rows = [];

    // ✅ Padel individual = athletes, selain itu = teams/standings
    if (isPadel && mode === 'individual') {
      ;[rows] = await db.query(`
    SELECT
      s.id,
      s.sport_id,
      sp.name AS sport_name,
      t.id AS team_id,
      t.name AS team_name,
      (
        SELECT COUNT(*)
        FROM match_participants mp
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.team_id = s.team_id
          AND m.sport_id = s.sport_id
          AND m.match_mode = 'individual'
      ) AS total_match,
      s.win,
      s.loss,
      s.game_win,
      s.game_loss,
      s.pts
    FROM standings s
    JOIN teams t ON t.id = s.team_id AND t.is_individual = 1
    JOIN sports sp ON sp.id = s.sport_id
    WHERE s.sport_id = ?
    ORDER BY s.pts DESC, s.win DESC
  `, [qSport]);
    } else if (isPadel) {
      ;[rows] = await db.query(`
      SELECT
        s.id,
        s.sport_id,
        sp.name AS sport_name,
        t.id AS team_id,
        t.name AS team_name,

        (
          SELECT COUNT(*)
          FROM matches m
          WHERE m.sport_id = s.sport_id
            AND (m.home_team_id = t.id OR m.away_team_id = t.id)
        ) AS total_match,

        s.win,
        s.loss,
        s.game_win,
        s.game_loss,
        s.pts
      FROM standings s
      JOIN teams t 
        ON t.id = s.team_id
      AND COALESCE(t.is_individual,0) = 0
      JOIN sports sp ON sp.id = s.sport_id
      WHERE s.sport_id = ?
      ORDER BY s.pts DESC
    `, [qSport]);
    } else {
      ;[rows] = await db.query(`
        SELECT
          s.id,
          s.sport_id,
          sp.name AS sport_name,
          t.id AS team_id,
          t.name AS team_name,
          s.played,
          s.win,
          s.draw,
          s.loss,
          s.game_win,
          s.game_loss,
          s.pts
        FROM standings s
        JOIN teams t ON t.id = s.team_id
        JOIN sports sp ON sp.id = s.sport_id
        WHERE s.sport_id = ?
        ORDER BY s.pts DESC
      `, [qSport]);
    }

    return res.render('standings/index', {
      title: 'Klasemen',
      standings: rows,
      sports,
      query: req.query,
      isPadel,
      mode
    });

  } catch (err) {
    console.error(err);
    return res.status(500).send('Terjadi kesalahan server');
  }
};
