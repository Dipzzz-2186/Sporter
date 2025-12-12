const db = require('../config/db');

async function loadAllowedSports(req, res, next) {
    try {
        if (!req.session.user) return next();

        if (req.session.user.role === 'admin') {
            const [rows] = await db.query('SELECT id FROM sports');
            req.allowedSports = rows.map(r => r.id);
            return next();
        }

        const [rows] = await db.query(
            'SELECT sport_id FROM user_sports WHERE user_id = ?',
            [req.session.user.id]
        );

        req.allowedSports = rows.map(r => r.sport_id);
        return next();
    } catch (e) {
        console.error('loadAllowedSports', e);
        req.allowedSports = [];
        return next();
    }
}

module.exports = loadAllowedSports;
