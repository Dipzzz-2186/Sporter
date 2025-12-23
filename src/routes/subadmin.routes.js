// src/routes/subadmin.routes.js
const express = require('express');
const router = express.Router();
const subadminCtrl = require('../controllers/subadmin.controller');
const standingsCtrl = require('../controllers/standings.controller');
const { requireLogin, requireAdminOrSubadmin } = require('../middlewares/auth.middleware');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { attachAllowedSports } = require('../middlewares/sport.middleware');
const subadminAthletes = require("../controllers/subadmin.athletes.controller");

// ✅ 1) FILE FILTER HARUS PALING ATAS (dipakai news & athlete)
const fileFilter = function (req, file, cb) {
  if (!file.mimetype.startsWith('image/')) return cb(new Error('File harus berupa gambar'), false);
  cb(null, true);
};

// ===== NEWS UPLOAD =====
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'news');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = 'news-' + Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, base + ext);
  }
});

const uploadNewsThumb = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB
});

// ===== ATHLETE PHOTO UPLOAD =====
const athleteUploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'athletes');
if (!fs.existsSync(athleteUploadsDir)) fs.mkdirSync(athleteUploadsDir, { recursive: true });

const athleteStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, athleteUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = 'athlete-' + Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, base + ext);
  }
});

const uploadAthletePhoto = multer({
  storage: athleteStorage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB
});


// apply to all subadmin routes (after requireLogin & requireAdminOrSubadmin in router usage)
router.use(requireLogin, requireAdminOrSubadmin, attachAllowedSports);

// dashboard
router.get('/', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderDashboard);

// Events
router.get('/events/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderCreateEvent);
router.post('/events/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.createEvent);

// News
// LIST + CREATE (sudah ada)
router.get('/news', requireLogin, requireAdminOrSubadmin, subadminCtrl.listNews);
router.get('/news/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderCreateNews);
router.post('/news/create', requireLogin, requireAdminOrSubadmin, uploadNewsThumb.single('thumbnail'), subadminCtrl.createNews);

// EDIT / UPDATE / DELETE (tambahkan these)
router.get('/news/:id/edit', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderEditNews);
router.post('/news/:id/edit', requireLogin, requireAdminOrSubadmin, uploadNewsThumb.single('thumbnail'), subadminCtrl.updateNews);
router.post('/news/:id/delete', requireLogin, requireAdminOrSubadmin, subadminCtrl.deleteNews);

// MATCHES (jadwal pertandingan)
router.get('/matches', requireLogin, requireAdminOrSubadmin, subadminCtrl.listMatches);
router.get('/matches/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderCreateMatch);
router.post('/matches/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.createMatch);
router.get('/matches/:id/edit', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderEditMatch);
router.post('/matches/:id/edit', requireLogin, requireAdminOrSubadmin, subadminCtrl.updateMatch);
router.post('/matches/:id/delete', requireLogin, requireAdminOrSubadmin, subadminCtrl.deleteMatch);
// Match scores
router.post('/matches/:id/scores', requireLogin, requireAdminOrSubadmin, subadminCtrl.addMatchScore);
router.post(
  '/matches/:id/submit-individual-score',
  requireLogin,
  requireAdminOrSubadmin,
  standingsCtrl.submitIndividualScore
);

// Videos & Livestreams
router.get('/videos/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderCreateVideo);
router.post('/videos/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.createVideo);
router.get('/livestreams/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderCreateLivestream);
router.post('/livestreams/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.createLivestream);

// Tickets
router.get('/tickets/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.renderCreateTicketType);
router.post('/tickets/create', requireLogin, requireAdminOrSubadmin, subadminCtrl.createTicketType);
router.get('/ticket-orders', subadminCtrl.renderTicketOrders);
router.get(
  '/ticket-orders/:userId',
  subadminCtrl.renderTicketOrderDetail
);

router.post(
  '/teams/ajax-create',
  requireLogin,
  requireAdminOrSubadmin,
  subadminCtrl.ajaxCreateTeam
);

// Standings - manual only
router.get('/standings', standingsCtrl.listStandings);

router.get('/standings/:id/add-win', standingsCtrl.addWin);
router.get('/standings/:id/add-loss', standingsCtrl.addLoss);
router.get('/standings/:id/submit', standingsCtrl.submitScore);

router.post('/athletes/ajax-create', subadminCtrl.ajaxCreateAthlete);

router.post(
  '/matches/:id/submit-score',
  requireLogin,
  requireAdminOrSubadmin,
  standingsCtrl.submitPadelMatchScore
);

// Teams management
router.get('/teams', subadminCtrl.listTeams);
router.get('/teams/:id/members', subadminCtrl.renderTeamMembers);
router.post('/teams/:id/members', subadminCtrl.addTeamMember);
router.post('/teams/:teamId/members/:athleteId/delete', subadminCtrl.deleteTeamMember);
router.get('/teams/create', subadminCtrl.renderCreateTeam);
router.post('/teams/create', subadminCtrl.createTeam);

//athletes
router.post('/athletes/:id', uploadAthletePhoto.single('photo'), subadminAthletes.updateAthlete);

// videos
router.get('/videos', subadminCtrl.listVideos);
router.get('/videos/:id/edit', subadminCtrl.renderEditVideo);
router.post('/videos/:id/edit', subadminCtrl.updateVideo);
router.post('/videos/:id/delete', subadminCtrl.deleteVideo);

// livestreams
router.get('/livestreams', subadminCtrl.listLivestreams);
router.get('/livestreams/:id/edit', subadminCtrl.renderEditLivestream);
router.post('/livestreams/:id/edit', subadminCtrl.updateLivestream);
router.post('/livestreams/:id/delete', subadminCtrl.deleteLivestream);

module.exports = router;
