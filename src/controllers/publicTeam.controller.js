const db = require('../config/db');

exports.show = async (req, res) => {
  try {
    const teamId = Number(req.params.id);
    if (!teamId) return res.status(404).send('Team tidak ditemukan');

    const [[team]] = await db.query(`
      SELECT t.*, sp.name AS sport_name
      FROM teams t
      JOIN sports sp ON sp.id = t.sport_id
      WHERE t.id = ?
      LIMIT 1
    `, [teamId]);

    if (!team) return res.status(404).send('Team tidak ditemukan');

    // anggota team (dari team_members)
    const [members] = await db.query(`
    SELECT
        tm.id,
        tm.team_id,
        tm.athlete_id,
        a.name,
        a.slug,
        tm.position,
        tm.number,
        tm.birth_date,
        tm.created_at
    FROM team_members tm
    JOIN athletes a ON a.id = tm.athlete_id
    WHERE tm.team_id = ?
    ORDER BY a.name ASC
    `, [teamId]);


    return res.render('teams/show', {
      title: team.name,
      team,
      members
    });
  } catch (err) {
    console.error('team.show error:', err);
    return res.status(500).send('Terjadi kesalahan server');
  }
};
