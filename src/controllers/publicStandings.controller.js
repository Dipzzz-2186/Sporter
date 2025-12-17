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
          a.id,
          a.slug,
          a.sport_id,
          sp.name AS sport_name,
          a.name AS athlete_name,
          a.points,
          a.match_played,
          a.match_won,
          a.match_lost,
          a.titles,
          pw.name AS paired_with_name,
          pw.slug AS paired_with_slug
        FROM athletes a
        JOIN sports sp ON sp.id = a.sport_id
        LEFT JOIN athletes pw ON pw.id = a.paired_with_athlete_id
        WHERE a.sport_id = ?
        ORDER BY a.points DESC, a.match_won DESC, a.titles DESC, a.name ASC
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
