const db = require('../config/db');

async function getStandings({ sportId, mode }) {
  if (!Number.isInteger(sportId)) {
    return { isPadel: false, rows: [] };
  }

  const [[sport]] = await db.query(
    `SELECT id, name FROM sports WHERE id = ?`,
    [sportId]
  );

  if (!sport) return { isPadel: false, rows: [] };

  const isPadel = sport.name.toLowerCase() === 'padel';

  let rows = [];

  // =========================
  // PADEL - INDIVIDUAL MODE
  // =========================
  if (isPadel && mode === 'individual') {
    [rows] = await db.query(`
    SELECT
      x.id,
      x.team_id,
      x.team_name,
      x.athlete_slug,
      x.sport_name,
      x.total_match,
      x.win,
      x.loss,
      x.game_win,
      x.game_loss,
      x.set_win,
      x.set_loss,
      x.set_diff,
      (x.score_for + x.live_score_for) AS score_for,
      (x.score_against + x.live_score_against) AS score_against,
      (x.score_for + x.live_score_for) - (x.score_against + x.live_score_against) AS score_diff
    FROM (
      SELECT
        s.id,
        s.team_id,
        t.name AS team_name,
        a.slug AS athlete_slug,
        sp.name AS sport_name,

        (
          SELECT COUNT(*)
          FROM match_participants mp
          JOIN matches m ON m.id = mp.match_id
          WHERE mp.team_id = s.team_id
            AND m.sport_id = s.sport_id
            AND m.match_mode = 'individual'
            AND m.status IN ('live','finished')
        ) AS total_match,

        s.win,
        s.loss,
        s.game_win,
        s.game_loss,
        s.set_win,
        s.set_loss,
        (s.set_win - s.set_loss) AS set_diff,
        s.score_for,
        s.score_against,

        COALESCE((
          SELECT SUM(
            CASE
              WHEN mp.position = 1 THEN COALESCE(m.home_score, 0)
              WHEN mp.position = 2 THEN COALESCE(m.away_score, 0)
              ELSE 0
            END
          )
          FROM match_participants mp
          JOIN matches m ON m.id = mp.match_id
          WHERE mp.team_id = s.team_id
            AND m.sport_id = s.sport_id
            AND m.match_mode = 'individual'
            AND m.status = 'live'
            AND m.is_finished = 0
        ), 0) AS live_score_for,

        COALESCE((
          SELECT SUM(
            CASE
              WHEN mp.position = 1 THEN COALESCE(m.away_score, 0)
              WHEN mp.position = 2 THEN COALESCE(m.home_score, 0)
              ELSE 0
            END
          )
          FROM match_participants mp
          JOIN matches m ON m.id = mp.match_id
          WHERE mp.team_id = s.team_id
            AND m.sport_id = s.sport_id
            AND m.match_mode = 'individual'
            AND m.status = 'live'
            AND m.is_finished = 0
        ), 0) AS live_score_against

      FROM standings s
      JOIN teams t ON t.id = s.team_id AND COALESCE(t.is_individual,0) = 1
      JOIN athletes a ON a.individual_team_id = t.id
      JOIN sports sp ON sp.id = s.sport_id
      WHERE s.sport_id = ?
    ) x
    WHERE x.total_match > 0
    ORDER BY
      x.win DESC,
      x.set_diff DESC,
      score_diff DESC,
      score_for DESC,
      x.team_name ASC,
      x.team_id ASC
  `, [sportId]);

    // =========================
    // PADEL - TEAM MODE
    // =========================
  } else if (isPadel) {
    [rows] = await db.query(`
      SELECT
        x.id,
        x.team_id,
        x.team_name,
        x.sport_name,
        x.total_match,
        x.win,
        x.loss,
        x.game_win,
        x.game_loss,
        x.set_win,
        x.set_loss,
        x.set_diff,
        (x.score_for + x.live_score_for) AS score_for,
        (x.score_against + x.live_score_against) AS score_against,
        (x.score_for + x.live_score_for) - (x.score_against + x.live_score_against) AS score_diff
      FROM (
        SELECT
          s.id,
          s.team_id AS team_id,               -- ✅ FIX UTAMA (biar Pug bisa /teams/:id)
          t.name AS team_name,
          sp.name AS sport_name,

          (
            SELECT COUNT(*)
            FROM matches m
            WHERE m.sport_id = s.sport_id
              AND (m.home_team_id = t.id OR m.away_team_id = t.id)
              AND m.status IN ('live','finished')
              AND COALESCE(m.match_mode,'team') = 'team'
          ) AS total_match,

          s.win,
          s.loss,
          s.game_win,
          s.game_loss,
          s.set_win,
          s.set_loss,
          (s.set_win - s.set_loss) AS set_diff,
          s.score_for,
          s.score_against,

          COALESCE((
            SELECT SUM(
              CASE
                WHEN m.home_team_id = t.id THEN COALESCE(m.home_score, 0)
                WHEN m.away_team_id = t.id THEN COALESCE(m.away_score, 0)
                ELSE 0
              END
            )
            FROM matches m
            WHERE m.sport_id = s.sport_id
              AND (m.home_team_id = t.id OR m.away_team_id = t.id)
              AND m.status = 'live'
              AND m.is_finished = 0
              AND COALESCE(m.match_mode,'team') = 'team'
          ), 0) AS live_score_for,

          COALESCE((
            SELECT SUM(
              CASE
                WHEN m.home_team_id = t.id THEN COALESCE(m.away_score, 0)
                WHEN m.away_team_id = t.id THEN COALESCE(m.home_score, 0)
                ELSE 0
              END
            )
            FROM matches m
            WHERE m.sport_id = s.sport_id
              AND (m.home_team_id = t.id OR m.away_team_id = t.id)
              AND m.status = 'live'
              AND m.is_finished = 0
              AND COALESCE(m.match_mode,'team') = 'team'
          ), 0) AS live_score_against

        FROM standings s
        JOIN teams t ON t.id = s.team_id
        JOIN sports sp ON sp.id = s.sport_id

        WHERE s.sport_id = ?
          AND COALESCE(t.is_individual,0) = 0
      ) x
      ORDER BY
        x.win DESC,
        x.set_diff DESC,
        score_diff DESC
    `, [sportId]);
    // =========================
    // GENERIC (NON-PADEL)
    // =========================
  } else {
    [rows] = await db.query(`
    SELECT
      s.id,
      s.team_id,
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

  return { isPadel, rows };
}

module.exports = { getStandings };


