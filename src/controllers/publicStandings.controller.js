const db = require('../config/db');

exports.index = async (req, res) => {
  try {
    const [sports] = await db.query(
      `SELECT id, name FROM sports ORDER BY name`
    );

    const qSport = req.query.sport_id
      ? Number(req.query.sport_id)
      : null;

    // kalau belum pilih sport
    if (!qSport) {
      return res.render('standings/index', {
        title: 'Klasemen',
        standings: [],
        sports,
        query: req.query,
        isPadel: false
      });
    }

    // ambil sport
    const [[sport]] = await db.query(
      `SELECT id, name FROM sports WHERE id = ?`,
      [qSport]
    );

    if (!sport) {
      return res.render('standings/index', {
        title: 'Klasemen',
        standings: [],
        sports,
        query: req.query,
        isPadel: false
      });
    }

    const isPadel = sport.name.toLowerCase() === 'padel';

    let rows = [];

    if (isPadel) {
      [rows] = await db.query(`
        SELECT
          s.id,
          s.sport_id,
          sp.name AS sport_name,
          t.name AS team_name,
        (
          SELECT COUNT(*)
          FROM matches m
          WHERE m.sport_id = s.sport_id
            AND s.team_id IN (m.home_team_id, m.away_team_id)
        ) AS total_match,
          s.win,
          s.loss,
          s.game_win,
          s.game_loss,
          (s.game_win - s.game_loss) AS game_diff,
          s.pts
        FROM standings s
        JOIN teams t ON t.id = s.team_id
        JOIN sports sp ON sp.id = s.sport_id
        WHERE s.sport_id = ?
        ORDER BY s.pts DESC, game_diff DESC, s.game_win DESC
      `, [qSport]);
    } else {
      [rows] = await db.query(`
        SELECT
          s.id,
          s.sport_id,
          sp.name AS sport_name,
          t.name AS team_name,
          s.played,
          s.win,
          s.draw,
          s.loss,
          s.goals_for,
          s.goals_against,
          (s.goals_for - s.goals_against) AS goal_diff,
          s.pts
        FROM standings s
        JOIN teams t ON t.id = s.team_id
        JOIN sports sp ON sp.id = s.sport_id
        WHERE s.sport_id = ?
        ORDER BY s.pts DESC, goal_diff DESC, s.goals_for DESC
      `, [qSport]);
    }

    res.render('standings/index', {
      title: 'Klasemen',
      standings: rows,
      sports,
      query: req.query,
      isPadel
    });

  } catch (err) {
    console.error(err);
    return res.status(500).send('Terjadi kesalahan server');
  }
};
