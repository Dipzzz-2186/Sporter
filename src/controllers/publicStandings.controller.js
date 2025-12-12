const db = require('../config/db');

exports.index = async (req, res) => {
  try {
    const [sports] = await db.query(`SELECT id, name FROM sports ORDER BY name`);

    const qSport = req.query.sport_id ? Number(req.query.sport_id) : null;

    if (!qSport) {
      return res.render('standings/index', {
        title: 'Klasemen',
        standings: [],
        sports,
        query: req.query
      });
    }

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

    return res.render('standings/index', {
      title: 'Klasemen',
      standings: rows,
      sports,
      query: req.query
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Terjadi kesalahan server');
  }
};
