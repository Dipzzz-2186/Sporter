// src/controllers/standings.controller.js
const db = require('../config/db');

async function syncPadelStandings(sportId) {
  await db.query(`
    INSERT INTO standings (
      sport_id,
      team_id,
      played,
      win,
      draw,
      loss,
      game_win,
      game_loss,
      pts
    )
    SELECT DISTINCT
      m.sport_id,
      t.id,
      0, 0, 0, 0, 0, 0, 0
    FROM matches m
    JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
    WHERE m.sport_id = ?
    AND NOT EXISTS (
      SELECT 1
      FROM standings s
      WHERE s.sport_id = m.sport_id
      AND s.team_id = t.id
    )
  `, [sportId]);
}

exports.listStandings = async (req, res) => {
  try {
    const allowed = req.allowedSports || [];

    const [sports] = await db.query(
      `SELECT id, name FROM sports WHERE id IN (?) ORDER BY name`,
      [allowed]
    );

    const sportId = req.query.sport_id
      ? Number(req.query.sport_id)
      : sports[0]?.id;

    if (!sportId) {
      return res.render('subadmin/standings', {
        standings: [],
        sports,
        query: {},
        isPadel: false
      });
    }

    const [[sport]] = await db.query(
      `SELECT id, name FROM sports WHERE id = ?`,
      [sportId]
    );

    const isPadel = sport.name.toLowerCase() === 'padel';

    if (isPadel) {
      await syncPadelStandings(sportId);

      const [rows] = await db.query(`
        SELECT
          s.id,
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
        WHERE s.sport_id = ?
        ORDER BY s.pts DESC, game_diff DESC
      `, [sportId]);

      return res.render('subadmin/standings', {
        standings: rows,
        sports,
        query: { sport_id: sportId },
        isPadel: true
      });
    }

    // === CABANG LAIN ===
    const [rows] = await db.query(`
      SELECT
        s.id,
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
      WHERE s.sport_id = ?
      ORDER BY s.pts DESC, goal_diff DESC
    `, [sportId]);

    return res.render('subadmin/standings', {
      standings: rows,
      sports,
      query: { sport_id: sportId },
      isPadel: false
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

  res.redirect(`/subadmin/standings?sport_id=${req.query.sport_id}`);
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
