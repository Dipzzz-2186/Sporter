// src/controllers/standings.controller.js
const db = require('../config/db');

async function syncPadelStandings(sportId, mode) {
  const modeWhere =
    mode === 'individual'
      ? 'AND t.is_individual = 1'
      : 'AND (t.is_individual = 0 OR t.is_individual IS NULL)';

  await db.query(`
    INSERT INTO standings (
      sport_id, team_id, played, win, draw, loss, game_win, game_loss, pts
    )
    SELECT DISTINCT
      m.sport_id,
      t.id,
      0,0,0,0,0,0,0
    FROM matches m
    JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
    WHERE m.sport_id = ?
      ${modeWhere}
      AND NOT EXISTS (
        SELECT 1 FROM standings s
        WHERE s.sport_id = m.sport_id AND s.team_id = t.id
      )
  `, [sportId]);
}


exports.listStandings = async (req, res) => {
  try {
    const allowed = req.allowedSports || [];
    const mode = (req.query.mode === 'individual') ? 'individual' : 'team';
    const isIndividual = mode === 'individual';
    

    const ids = (allowed || []).map(Number).filter(Boolean);
    if (!ids.length) {
      return res.render('subadmin/standings', {
        standings: [],
        sports: [],
        query: req.query || {},
        isPadel: false,
        mode
      });
    }


    const [sports] = await db.query(
      `SELECT id, name FROM sports WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY name`,
      ids
    );

    const sportId = req.query.sport_id
      ? Number(req.query.sport_id)
      : sports[0]?.id;

    if (!sportId) {
      return res.render('subadmin/standings', {
        standings: [],
        sports,
        query: {},
        isPadel: false,
        mode
      });
    }

    const [[sport]] = await db.query(
      `SELECT id, name FROM sports WHERE id = ?`,
      [sportId]
    );

   const isPadel = sport.name.toLowerCase() === 'padel';

    let rows = [];

    if (isPadel && mode === 'individual') {
      // ✅ Padel Individual: ambil dari ATHLETES
      ;[rows] = await db.query(`
        SELECT
          a.id,
          a.slug,
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
      `, [sportId]);

    } else {
      // ✅ TEAM (termasuk padel team & cabang lain)
      if (isPadel) await syncPadelStandings(sportId, mode); // optional: cuma perlu buat padel team

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
          AND COALESCE(t.is_individual, 0) = ?
        ORDER BY s.pts DESC
      `, [sportId, 0]); // team = 0
    }




    return res.render('subadmin/standings', {
      standings: rows,
      sports,
      query: { ...req.query, sport_id: sportId, mode }, // ✅ KEEP MODE
      isPadel,
      mode
    });

  } catch (err) {
    console.error(err);
    res.redirect('/subadmin');
  }
};

exports.addWin = async (req, res) => {
  const { id } = req.params;
  const { game_win = 0, game_loss = 0 } = req.query;

  await db.query(`
    UPDATE standings
    SET
      win = win + 1,
      game_win = game_win + ?,
      game_loss = game_loss + ?,
      pts = pts + 3
    WHERE id = ?
  `, [game_win, game_loss, id]);

 const mode = req.query.mode === 'individual' ? 'individual' : 'team';
 res.redirect(`/subadmin/standings?sport_id=${req.query.sport_id}&mode=${mode}`);

};

exports.addLoss = async (req, res) => {
  const { id } = req.params;
  const { game_win = 0, game_loss = 0 } = req.query;

  await db.query(`
    UPDATE standings
    SET
      loss = loss + 1,
      game_win = game_win + ?,
      game_loss = game_loss + ?
    WHERE id = ?
  `, [game_win, game_loss, id]);

  res.redirect(`/subadmin/standings?sport_id=${req.query.sport_id}`);
};

exports.submitScore = async (req, res) => {
  const { id } = req.params;               // ✅ AMBIL DARI PARAM
  const { game_win, game_loss, result } = req.query;

  if (!id || game_win == null || game_loss == null || !result) {
    return res.status(400).json({
      success: false,
      message: 'Data tidak lengkap'
    });
  }

  const win = result === 'win' ? 1 : 0;
  const loss = result === 'loss' ? 1 : 0;
  const pts = win ? 3 : 0;

  await db.query(`
    UPDATE standings
    SET
      played    = played + 1,
      win       = win + ?,
      loss      = loss + ?,
      game_win  = game_win + ?,
      game_loss = game_loss + ?,
      pts       = pts + ?
    WHERE id = ?
  `, [win, loss, game_win, game_loss, pts, id]);

  res.json({ success: true });
};

exports.submitPadelMatchScore = async (req, res) => {
  const matchId = Number(req.params.id);
  const { home_score, away_score } = req.body;

  if (!matchId || home_score == null || away_score == null) {
    return res.status(400).json({ message: 'Data tidak lengkap' });
  }

  if (Number(home_score) === Number(away_score)) {
    return res.status(400).json({ message: 'Skor tidak boleh seri' });
  }

  // Ambil match + team
  const [[match]] = await db.query(`
    SELECT m.id, m.sport_id, m.home_team_id, m.away_team_id
    FROM matches m
    JOIN sports s ON s.id = m.sport_id
    WHERE m.id = ? AND LOWER(s.name) = 'padel'
  `, [matchId]);

  if (!match) {
    return res.status(404).json({ message: 'Match padel tidak ditemukan' });
  }

  const homeWin = Number(home_score) > Number(away_score);

  // Update HOME
  await db.query(`
    UPDATE standings
    SET
      played = played + 1,
      win = win + ?,
      loss = loss + ?,
      game_win = game_win + ?,
      game_loss = game_loss + ?,
      pts = pts + ?
    WHERE sport_id = ? AND team_id = ?
  `, [
    homeWin ? 1 : 0,
    homeWin ? 0 : 1,
    home_score,
    away_score,
    homeWin ? 3 : 0,
    match.sport_id,
    match.home_team_id
  ]);

  // Update AWAY
  await db.query(`
    UPDATE standings
    SET
      played = played + 1,
      win = win + ?,
      loss = loss + ?,
      game_win = game_win + ?,
      game_loss = game_loss + ?,
      pts = pts + ?
    WHERE sport_id = ? AND team_id = ?
  `, [
    homeWin ? 0 : 1,
    homeWin ? 1 : 0,
    away_score,
    home_score,
    homeWin ? 0 : 3,
    match.sport_id,
    match.away_team_id
  ]);
  
  res.json({ success: true });
};
