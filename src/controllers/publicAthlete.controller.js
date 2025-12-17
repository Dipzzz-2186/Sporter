const db = require('../config/db');

exports.show = async (req, res) => {
  try {
    const slug = (req.params.slug || '').trim();

    if (!slug) return res.status(404).render('errors/404', { title: 'Athlete tidak ditemukan' });

    const [[athlete]] = await db.query(`
      SELECT
        a.*,
        sp.name AS sport_name,
        pw.name AS paired_with_name,
        pw.slug AS paired_with_slug
      FROM athletes a
      JOIN sports sp ON sp.id = a.sport_id
      LEFT JOIN athletes pw ON pw.id = a.paired_with_athlete_id
      WHERE a.slug = ?
      LIMIT 1
    `, [slug]);

    if (!athlete) {
      return res.status(404).render('errors/404', { title: 'Athlete tidak ditemukan' });
    }

    const [pointsBreakdown] = await db.query(`
      SELECT tournament, category, event_date, round_name, points
      FROM athlete_points
      WHERE athlete_id = ?
      ORDER BY event_date DESC, id DESC
      LIMIT 50
    `, [athlete.id]);

    res.render('athletes/show', {
      title: athlete.name || 'Athlete',
      athlete,
      pointsBreakdown
    });

  } catch (err) {
    console.error('athlete.show error:', err);
    return res.status(500).send('Terjadi kesalahan server');
  }
};
