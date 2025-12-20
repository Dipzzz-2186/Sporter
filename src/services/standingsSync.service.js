// src/services/standingsSync.service.js
const db = require('../config/db');

async function syncGenericStandings(sportId) {
  // 🔥 cek apakah match individual ada
  const [[row]] = await db.query(`
    SELECT COUNT(*) AS c
    FROM matches
    WHERE sport_id = ?
      AND match_mode = 'individual'
  `, [sportId]);

  // ===== INDIVIDUAL SPORT (RUN, dll)
  if (row.c > 0) {
    await db.query(`
      INSERT IGNORE INTO standings (sport_id, team_id)
      SELECT DISTINCT
        m.sport_id,
        mp.team_id
      FROM matches m
      JOIN match_participants mp ON mp.match_id = m.id
      WHERE m.sport_id = ?
        AND mp.team_id IS NOT NULL
    `, [sportId]);
    return;
  }

  // ===== TEAM SPORT (bola, futsal, dll)
  await db.query(`
    INSERT IGNORE INTO standings (sport_id, team_id)
    SELECT DISTINCT
      m.sport_id,
      t.id
    FROM matches m
    JOIN teams t
      ON (t.id = m.home_team_id OR t.id = m.away_team_id)
    WHERE m.sport_id = ?
  `, [sportId]);
}


async function syncPadelStandings(sportId, mode) {
    if (mode === 'individual') {
        await db.query(`
      INSERT IGNORE INTO standings
        (sport_id, team_id)
      SELECT DISTINCT
        m.sport_id,
        mp.team_id
      FROM matches m
      JOIN match_participants mp ON mp.match_id = m.id
      JOIN teams t ON t.id = mp.team_id
      WHERE m.sport_id = ?
        AND t.is_individual = 1
        AND mp.team_id IS NOT NULL
    `, [sportId]);
    } else {
        await db.query(`
      INSERT IGNORE INTO standings
        (sport_id, team_id)
      SELECT DISTINCT
        m.sport_id,
        t.id
      FROM matches m
      JOIN teams t
        ON (t.id = m.home_team_id OR t.id = m.away_team_id)
      WHERE m.sport_id = ?
        AND COALESCE(t.is_individual,0) = 0
    `, [sportId]);
    }
}

module.exports = {
    syncGenericStandings,
    syncPadelStandings
};
