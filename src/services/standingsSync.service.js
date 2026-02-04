// src/services/standingsSync.service.js
const db = require('../config/db');

/**
 * Sync standings untuk sport generic (team / individual non-padel)
 */
async function syncGenericStandings(sportId) {
  // cek apakah ada match individual
  const [[row]] = await db.query(
    `
    SELECT COUNT(*) AS c
    FROM matches
    WHERE sport_id = ?
      AND match_mode = 'individual'
      AND status IN ('live','finished')
    `,
    [sportId]
  );

  // ===== INDIVIDUAL SPORT =====
  if (row.c > 0) {
    await db.query(
      `
      INSERT IGNORE INTO standings (sport_id, team_id)
      SELECT DISTINCT
        m.sport_id,
        mp.team_id
      FROM matches m
      JOIN match_participants mp ON mp.match_id = m.id
      WHERE m.sport_id = ?
        AND mp.team_id IS NOT NULL
        AND m.status IN ('live','finished')
      `,
      [sportId]
    );
    return;
  }

  // ===== TEAM SPORT =====
  await db.query(
    `
    INSERT IGNORE INTO standings (sport_id, team_id)
    SELECT DISTINCT
      m.sport_id,
      t.id
    FROM matches m
    JOIN teams t
      ON (t.id = m.home_team_id OR t.id = m.away_team_id)
    WHERE m.sport_id = ?
      AND m.status IN ('live','finished')
    `,
    [sportId]
  );
}

/**
 * Sync standings khusus PADEL
 */
async function syncPadelStandings(sportId, mode) {
  // ❌ JANGAN cleanup di individual
  if (mode === 'team') {
    await db.query(`
    DELETE s
    FROM standings s
    JOIN teams t ON t.id = s.team_id
    LEFT JOIN matches m
      ON m.sport_id = s.sport_id
    AND (
          m.home_team_id = s.team_id
          OR m.away_team_id = s.team_id
        )
    WHERE s.sport_id = ?
      AND t.is_individual = 0
      AND m.id IS NULL
    `, [sportId]);
  }

  // =========================
  // INSERT DATA VALID
  // =========================
  if (mode === 'individual') {
    await db.query(
      `
      INSERT IGNORE INTO standings (sport_id, team_id)
      SELECT DISTINCT
        m.sport_id,
        mp.team_id
      FROM matches m
      JOIN match_participants mp ON mp.match_id = m.id
      JOIN teams t ON t.id = mp.team_id
      WHERE m.sport_id = ?
        AND t.is_individual = 1
        AND mp.team_id IS NOT NULL
        AND m.status IN ('live','finished')
      `,
      [sportId]
    );
  } else {
    await db.query(
      `
      INSERT IGNORE INTO standings (sport_id, team_id)
      SELECT DISTINCT
        m.sport_id,
        t.id
      FROM matches m
      JOIN teams t
        ON (t.id = m.home_team_id OR t.id = m.away_team_id)
      WHERE m.sport_id = ?
        AND COALESCE(t.is_individual, 0) = 0
        AND m.status IN ('live','finished')
      `,
      [sportId]
    );
  }
}

module.exports = {
  syncGenericStandings,
  syncPadelStandings
};
