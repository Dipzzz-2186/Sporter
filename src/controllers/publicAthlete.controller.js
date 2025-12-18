const db = require('../config/db');

exports.show = async (req, res) => {
  try {
    const slug = (req.params.slug || '').trim();

    if (!slug) {
      req.flash('error', 'Atlet tidak ditemukan');
      return res.redirect('/');
    }

    // Query athlete dengan data lengkap
    const [[athlete]] = await db.query(`
      SELECT
        a.*,
        sp.name AS sport_name,
        pw.name AS paired_with_name,
        pw.slug AS paired_with_slug,
        (SELECT COUNT(*) + 1
        FROM athletes a2
        WHERE a2.sport_id = a.sport_id AND a2.points > a.points) AS rank_pos,
        CASE
          WHEN (a.match_won + a.match_lost) > 0
          THEN ROUND((a.match_won / (a.match_won + a.match_lost)) * 100, 1)
          ELSE 0
        END AS effectiveness
      FROM athletes a
      JOIN sports sp ON sp.id = a.sport_id
      LEFT JOIN athletes pw ON pw.id = a.paired_with_athlete_id
      WHERE a.slug = ?
      LIMIT 1
    `, [slug]);

    if (!athlete) {
      req.flash('error', 'Atlet tidak ditemukan');
      return res.redirect('/');
    }

    // Points breakdown (riwayat poin)
    const [pointsBreakdown] = await db.query(`
      SELECT tournament, category, event_date, round_name, points
      FROM athlete_points
      WHERE athlete_id = ?
      ORDER BY event_date DESC, id DESC
      LIMIT 50
    `, [athlete.id]);

    // Points by tournament (agregat per turnamen)
    const [pointsByTournament] = await db.query(`
      SELECT 
        tournament,
        category,
        SUM(points) AS total_points,
        MAX(event_date) AS last_event
      FROM athlete_points
      WHERE athlete_id = ?
      GROUP BY tournament, category
      ORDER BY total_points DESC
      LIMIT 22
    `, [athlete.id]);

    res.render('athletes/show', {
      title: athlete.name || 'Athlete',
      athlete,
      rank: athlete.rank || '-',
      effectiveness: athlete.effectiveness || 0,
      pointsBreakdown,
      pointsByTournament
    });

  } catch (err) {
    console.error('athlete.show error:', err);
    req.flash('error', 'Terjadi kesalahan server');
    return res.redirect('/');
  }
};