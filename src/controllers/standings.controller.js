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
    const [[padel]] = await db.query(
      `SELECT id, name FROM sports WHERE LOWER(name) = 'padel' LIMIT 1`
    );

    if (!padel) {
      return res.render('subadmin/standings', {
        title: 'Klasemen Padel',
        standings: [],
        sports: [],
        query: {}
      });
    }

    // 🔥 AUTO SEED TIM
    await syncPadelStandings(padel.id);

    const [rows] = await db.query(`
      SELECT
        s.id,
        s.team_id,
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
      ORDER BY
        s.pts DESC,
        game_diff DESC,
        s.game_win DESC
    `, [padel.id]);

    return res.render('subadmin/standings', {
      title: 'Klasemen Padel',
      standings: rows,
      sports: [padel],
      query: { sport_id: padel.id }
    });

  } catch (err) {
    console.error(err);
    req.flash('error', 'Gagal memuat klasemen padel');
    return res.redirect('/subadmin');
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

  res.redirect('/subadmin/standings');
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

  res.redirect('/subadmin/standings');
};

exports.submitScore = async (req, res) => {
  const { id } = req.params;
  const { game_win, game_loss, result } = req.query;

  if (!id || game_win == null || game_loss == null) {
    req.flash('error', 'Data skor tidak lengkap');
    return res.redirect('/subadmin/standings');
  }

  const win = result === 'win' ? 1 : 0;
  const loss = result === 'loss' ? 1 : 0;
  const pts = win ? 3 : 0;

  await db.query(`
    UPDATE standings
    SET
      win = win + ?,
      loss = loss + ?,
      game_win = game_win + ?,
      game_loss = game_loss + ?,
      pts = pts + ?
    WHERE id = ?
  `, [win, loss, game_win, game_loss, pts, id]);

  res.redirect('/subadmin/standings');
};
