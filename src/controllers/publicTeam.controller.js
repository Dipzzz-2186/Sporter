const db = require('../config/db');

exports.show = async (req, res) => {
  const rawId = req.params.id;                // buat debug
  const teamId = Number(rawId);

  try {
    console.log('[publicTeam.show] hit:', { rawId, teamId, url: req.originalUrl });

    // validasi id (biar gak silent redirect)
    if (!Number.isInteger(teamId) || teamId <= 0) {
      console.log('[publicTeam.show] invalid team id:', rawId);
      req.flash?.('error', 'Team ID tidak valid');
      return res.redirect('/');
      // atau: return res.status(404).send('Team ID invalid');
    }

    // 1) Ambil data team
    const [teamRows] = await db.query(`
      SELECT t.*, s.name AS sport_name
      FROM teams t
      JOIN sports s ON s.id = t.sport_id
      WHERE t.id = ?
      LIMIT 1
    `, [teamId]);

    const team = teamRows[0];
    if (!team) {
      console.log('[publicTeam.show] team not found for id:', teamId);
      req.flash?.('error', 'Team tidak ditemukan');
      return res.redirect('/');
      // atau: return res.status(404).send('Team not found');
    }

    // 2) Ambil anggota team
    const [members] = await db.query(`
      SELECT 
        a.id,
        a.name,
        a.slug,
        a.photo_url
      FROM team_members tm
      JOIN athletes a ON a.id = tm.athlete_id
      WHERE tm.team_id = ?
      ORDER BY a.name
    `, [teamId]);


    console.log('[publicTeam.show] loaded:', { team: team.name, members: members.length });

    return res.render('teams/show', {
      title: team.name,
      team,
      members
    });

  } catch (err) {
    console.error('[publicTeam.show] ERROR:', {
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
      stack: err.stack
    });
    req.flash?.('error', 'Terjadi kesalahan server saat membuka team');
    return res.redirect('/');
  }
};
