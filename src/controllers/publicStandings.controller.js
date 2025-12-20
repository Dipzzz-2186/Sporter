const db = require('../config/db');
const { getStandings } = require('../services/standings.service');
const {
  syncPadelStandings,
  syncGenericStandings
} = require('../services/standingsSync.service');

exports.index = async (req, res) => {
  const [sports] = await db.query(`SELECT id, name FROM sports ORDER BY name`);

  const sportId = Number(req.query.sport_id);
  const mode = req.query.mode === 'individual' ? 'individual' : 'team';

  if (!sportId) {
    return res.render('standings/index', {
      standings: [],
      sports,
      query: req.query,
      isPadel: false,
      mode,
      isReadOnly: true
    });
  }

  const [[sport]] = await db.query(
    'SELECT name FROM sports WHERE id = ?',
    [sportId]
  );

  const isPadel = sport.name.toLowerCase() === 'padel';

  if (isPadel) {
    await syncPadelStandings(sportId, mode);
  } else {
    await syncGenericStandings(sportId);
  }

  const { rows } = await getStandings({ sportId, mode });

  res.render('standings/index', {
    standings: rows,
    sports,
    query: { sport_id: sportId, mode },
    isPadel,
    mode,
    isReadOnly: true
  });
};