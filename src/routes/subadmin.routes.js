// src/routes/subadmin.routes.js
const express = require('express');
const router = express.Router();
const subadminCtrl = require('../controllers/subadmin.controller');
const { requireLogin } = require('../middlewares/auth.middleware');
const { requireAdminOrSubadmin } = require('../middlewares/auth.middleware');

// dashboard
router.get('/', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderDashboard);

// Events
router.get('/events/create', subadminCtrl.renderCreateEvent); // show form (needs sports list)
router.post('/events/create', subadminCtrl.createEvent);

// News
router.get('/news/create', subadminCtrl.renderCreateNews);
router.post('/news/create', subadminCtrl.createNews);

// Matches (schedule)
router.get('/matches/create', subadminCtrl.renderCreateMatch);
router.post('/matches/create', subadminCtrl.createMatch);

// Match scores (for existing match)
router.post('/matches/:id/scores', subadminCtrl.addMatchScore);

// Videos (VOD/highlights) — ensure videos.type != 'livestream'
router.get(
  '/videos/create',
  requireLogin,
  requireAdminOrSubadmin,
  subadminCtrl.renderCreateVideo
);
router.post(
  '/videos/create',
  requireLogin,
  requireAdminOrSubadmin,
  subadminCtrl.createVideo
);

// Livestreams (separate)
router.get('/livestreams/create', subadminCtrl.renderCreateLivestream);
router.post('/livestreams/create', subadminCtrl.createLivestream);

// Ticket types for event/match
router.get('/tickets/create', subadminCtrl.renderCreateTicketType);
router.post('/tickets/create', subadminCtrl.createTicketType);

module.exports = router;
