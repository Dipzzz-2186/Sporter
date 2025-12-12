// src/middlewares/sport.middleware.js
const db = require('../config/db');

async function attachAllowedSports(req, res, next) {
    try {
        if (!req.session || !req.session.user) {
            req.allowedSports = [];
            return next();
        }

        if (req.session.user.role === 'admin') {
            const [rows] = await db.query('SELECT id FROM sports');
            req.allowedSports = rows.map(r => Number(r.id));
            return next();
        }

        const [rows] = await db.query('SELECT sport_id FROM user_sports WHERE user_id = ?', [req.session.user.id]);
        req.allowedSports = rows.map(r => Number(r.sport_id));
        return next();
    } catch (err) {
        console.error('attachAllowedSports error', err);
        req.allowedSports = [];
        return next();
    }
}

function ownsSport(req, sportId) {
    if (!sportId) return false;
    if (req.session && req.session.user && req.session.user.role === 'admin') return true;
    return Array.isArray(req.allowedSports) && req.allowedSports.includes(Number(sportId));
}

module.exports = { attachAllowedSports, ownsSport };
