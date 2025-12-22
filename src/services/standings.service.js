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

    if (isPadel && mode === 'individual') {
      [rows] = await db.query(`
        SELECT
          s.id,
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
          (s.score_for - s.score_against) AS score_diff
        FROM standings s
        JOIN teams t ON t.id = s.team_id AND t.is_individual = 1
        JOIN athletes a ON a.individual_team_id = t.id
        JOIN sports sp ON sp.id = s.sport_id
        WHERE s.sport_id = ?
        ORDER BY
          s.win DESC,
          (s.game_win - s.game_loss) DESC
      `, [sportId]);


    } else if (isPadel) {
        [rows] = await db.query(`
    SELECT
      s.id,
      t.name AS team_name,
      sp.name AS sport_name,
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
      s.set_win,
      s.set_loss,
      (s.set_win - s.set_loss) AS set_diff,
      s.score_for,
      s.score_against,
      (s.score_for - s.score_against) AS score_diff
    FROM standings s
    JOIN teams t ON t.id = s.team_id
    JOIN sports sp ON sp.id = s.sport_id
    WHERE s.sport_id = ?
      AND COALESCE(t.is_individual,0) = 0
    ORDER BY
      s.win DESC,
      (s.game_win - s.game_loss) DESC
  `, [sportId]);
    } else {
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

    return { isPadel, rows };
}

module.exports = { getStandings };
