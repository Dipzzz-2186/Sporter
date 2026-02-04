const db = require('../config/db');

exports.show = async (req, res) => {
  try {
    const slug = (req.params.slug || '').trim();
    if (!slug) return res.redirect('/');

    // 1) Ambil data athlete
    const [[athlete]] = await db.query(`
      SELECT
        a.*,
        sp.name AS sport_name,
        pw.name AS paired_with_name,
        pw.slug AS paired_with_slug,
        (SELECT COUNT(*) + 1
         FROM athletes a2
         WHERE a2.sport_id = a.sport_id AND a2.points > a.points) AS rank_pos
      FROM athletes a
      JOIN sports sp ON sp.id = a.sport_id
      LEFT JOIN athletes pw ON pw.id = a.paired_with_athlete_id
      WHERE a.slug = ?
      LIMIT 1
    `, [slug]);

    if (!athlete) return res.redirect('/');

    // =========================
    // A) CARI TEAM DARI team_members
    // =========================
    const [[teamRow]] = await db.query(`  
      SELECT t.id, t.name, t.sport_id, t.is_individual
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.athlete_id = ?
      LIMIT 1
    `, [athlete.id]);

    let teamId = teamRow?.id || null;

    // =========================
    // B) FALLBACK individual team
    // =========================
    if (!teamId) {
      const [[indTeam]] = await db.query(`
        SELECT t.id
        FROM standings s
        JOIN teams t ON t.id = s.team_id
        WHERE s.sport_id = ?
          AND COALESCE(t.is_individual,0) = 1
          AND LOWER(TRIM(t.name)) = LOWER(TRIM(?))
        LIMIT 1
      `, [athlete.sport_id, athlete.name]);

      teamId = indTeam?.id || null;
    }

    // =========================
    // ✅ TENTUKAN MODE & BACK URL (DI SINI BARU BOLEH)
    // =========================
    const isIndividualAthlete =
      !teamRow || teamRow.is_individual === 1;

    const backUrl = isIndividualAthlete
      ? `/standings?sport_id=${athlete.sport_id}&mode=individual`
      : `/teams/${teamRow.id}`;

    // =========================
    // C) STATS
    // =========================
    let stats = { match_played: 0, match_won: 0, match_lost: 0 };
    let rank = Number(athlete.rank_pos || 1);

    // =========================
    // D) HITUNG RANK SESUAI MODE
    // =========================
    if (teamId) {
      const isIndividual = isIndividualAthlete ? 1 : 0;

      // stats tetap dari standings
      const [[stat]] = await db.query(`
    SELECT played, win, loss
    FROM standings
    WHERE sport_id = ?
      AND team_id = ?
  `, [athlete.sport_id, teamId]);

      stats = {
        match_played: Number(stat?.played || 0),
        match_won: Number(stat?.win || 0),
        match_lost: Number(stat?.loss || 0),
      };

      let rows = [];

      if (isIndividual) {
        // =========================
        // 🧍‍♂️ INDIVIDUAL RANKING
        // =========================
        [rows] = await db.query(`
      SELECT x.team_id
      FROM (
        SELECT
          s.team_id,
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
          (s.set_win - s.set_loss) AS set_diff,
          (s.score_for - s.score_against) AS score_diff
        FROM standings s
        JOIN teams t ON t.id = s.team_id
        WHERE s.sport_id = ?
          AND t.is_individual = 1
      ) x
      WHERE x.total_match > 0
      ORDER BY
        x.win DESC,
        x.set_diff DESC,
        x.score_diff DESC,
        x.team_id ASC
    `, [athlete.sport_id]);

      } else {
        // =========================
        // 👥 TEAM RANKING (INI FIX)
        // =========================
        [rows] = await db.query(`
      SELECT s.team_id
      FROM standings s
      JOIN teams t ON t.id = s.team_id
      WHERE s.sport_id = ?
        AND COALESCE(t.is_individual,0) = 0
        AND s.played > 0
      ORDER BY
        s.win DESC,
        (s.set_win - s.set_loss) DESC,
        (s.score_for - s.score_against) DESC,
        s.team_id ASC
    `, [athlete.sport_id]);
      }

      const idx = rows.findIndex(r => Number(r.team_id) === Number(teamId));
      rank = idx >= 0 ? idx + 1 : rank;
    }

    const effectiveness =
      (stats.match_won + stats.match_lost) > 0
        ? Number(((stats.match_won / (stats.match_won + stats.match_lost)) * 100).toFixed(1))
        : 0;

    const [pointsBreakdown] = await db.query(`
      SELECT tournament, category, event_date, round_name, points
      FROM athlete_points
      WHERE athlete_id = ?
      ORDER BY event_date DESC, id DESC
      LIMIT 50
    `, [athlete.id]);

    const [pointsByTournament] = await db.query(`
      SELECT tournament, category, SUM(points) AS total_points, MAX(event_date) AS last_event
      FROM athlete_points
      WHERE athlete_id = ?
      GROUP BY tournament, category
      ORDER BY total_points DESC
      LIMIT 22
    `, [athlete.id]);

    return res.render('athletes/show', {
      title: athlete.name || 'Athlete',
      athlete,
      team: teamRow || null,
      teamId,
      stats,
      rank,
      effectiveness,
      pointsBreakdown,
      pointsByTournament,
      backUrl,
      isIndividualAthlete
    });

  } catch (err) {
    console.error('athlete.show error:', err);
    return res.redirect('/');
  }
};
