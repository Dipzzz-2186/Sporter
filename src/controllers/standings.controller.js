// src/controllers/standings.controller.js
const db = require('../config/db');

async function syncPadelStandings(sportId, mode) {
  if (mode === 'individual') {
    await db.query(`
      INSERT IGNORE INTO standings
        (sport_id, team_id, played, win, draw, loss, game_win, game_loss, pts)
      SELECT DISTINCT
        m.sport_id,
        mp.team_id,
        0,0,0,0,0,0,0
      FROM matches m
      JOIN match_participants mp ON mp.match_id = m.id
      JOIN teams t ON t.id = mp.team_id
      WHERE m.sport_id = ?
        AND t.is_individual = 1
        AND t.sport_id = m.sport_id
        AND mp.team_id IS NOT NULL
    `, [sportId]);
  } else {
    await db.query(`
    INSERT IGNORE INTO standings
      (sport_id, team_id, played, win, draw, loss, game_win, game_loss, pts)
    SELECT DISTINCT
      m.sport_id,
      t.id,
      0,0,0,0,0,0,0
    FROM matches m
    JOIN teams t
      ON (t.id = m.home_team_id OR t.id = m.away_team_id)
    WHERE m.sport_id = ?
      AND t.sport_id = m.sport_id
      AND COALESCE(t.is_individual,0) = 0
  `, [sportId]);
  }
}

async function hasPadelIndividualMatch(sportId) {
  const [[row]] = await db.query(`
    SELECT COUNT(*) AS total
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE m.sport_id = ?
  `, [sportId]);

  return row.total > 0;
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
      await syncPadelStandings(sportId, 'individual');

      [rows] = await db.query(`
    SELECT
      s.id,
      t.name AS team_name,
      sp.name AS sport_name,
      (
      SELECT COUNT(*)
      FROM match_participants mp
      JOIN matches m ON m.id = mp.match_id
      WHERE mp.team_id = s.team_id
        AND m.sport_id = s.sport_id
        AND m.match_mode = 'individual'
    ) AS total_match,
      s.played AS played_scored,
      s.win,
      s.loss,
      s.game_win,
      s.game_loss,
      s.pts
    FROM standings s
    JOIN teams t 
      ON t.id = s.team_id
     AND t.is_individual = 1
    JOIN sports sp 
      ON sp.id = s.sport_id
    WHERE s.sport_id = ?
    ORDER BY s.pts DESC, s.win DESC
  `, [sportId]);
    }else if (isPadel) {

      // ✅ PADEL TEAM
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
    AND t.sport_id = s.sport_id   -- 🔥 WAJIB
    JOIN sports sp 
      ON sp.id = s.sport_id
    WHERE s.sport_id = ?
      AND COALESCE(t.is_individual, 0) = 0
    ORDER BY s.pts DESC
  `, [sportId]);

    } else {
      // 🔥 NON PADEL (klasemen klasik)
      [rows] = await db.query(`
    SELECT
      s.id,
      t.name AS team_name,
      sp.name AS sport_name,
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
    ORDER BY s.pts DESC, goal_diff DESC, s.win DESC
  `, [sportId]);
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

exports.submitIndividualScore = async (req, res) => {
  const matchId = Number(req.params.id);
  const { home_score, away_score } = req.body;

  if (!matchId || home_score == null || away_score == null) {
    return res.status(400).json({ message: 'Data tidak lengkap' });
  }

  if (home_score === away_score) {
    return res.status(400).json({ message: 'Skor tidak boleh seri' });
  }

  const [participants] = await db.query(`
    SELECT mp.athlete_id
    FROM match_participants mp
    WHERE mp.match_id = ?
    ORDER BY mp.position ASC
  `, [matchId]);

  if (participants.length !== 2) {
    return res.status(400).json({ message: 'Match individual harus 2 peserta' });
  }

  const [p1, p2] = participants;
  const p1Win = home_score > away_score;

  // simpan log (boleh overwrite)
  await db.query(`
  INSERT INTO match_participant_scores
    (match_id, athlete_id, game_win, game_loss, is_winner)
  VALUES
    (?, ?, ?, ?, ?),
    (?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    game_win  = game_win  + VALUES(game_win),
    game_loss = game_loss + VALUES(game_loss),
    is_winner = is_winner OR VALUES(is_winner)
`, [
    matchId, p1.athlete_id, home_score, away_score, p1Win ? 1 : 0,
    matchId, p2.athlete_id, away_score, home_score, p1Win ? 0 : 1
  ]);
  // ambil team_id per atlet dari match_participants
  const [[t1]] = await db.query(`
  SELECT team_id
  FROM match_participants
  WHERE match_id = ? AND athlete_id = ?
  LIMIT 1
`, [matchId, p1.athlete_id]);

  const [[t2]] = await db.query(`
  SELECT team_id
  FROM match_participants
  WHERE match_id = ? AND athlete_id = ?
  LIMIT 1
`, [matchId, p2.athlete_id]);

  // UPDATE P1
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
    p1Win ? 1 : 0,
    p1Win ? 0 : 1,
    home_score,
    away_score,
    p1Win ? 3 : 0,
  /* sport_id */ (await db.query(`SELECT sport_id FROM matches WHERE id=?`, [matchId]))[0][0].sport_id,
    t1.team_id
  ]);

  // UPDATE P2
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
    p1Win ? 0 : 1,
    p1Win ? 1 : 0,
    away_score,
    home_score,
    p1Win ? 0 : 3,
    (await db.query(`SELECT sport_id FROM matches WHERE id=?`, [matchId]))[0][0].sport_id,
    t2.team_id
  ]);

  res.json({ success: true });
};
