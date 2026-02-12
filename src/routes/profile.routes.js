const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const profileController = require('../controllers/profile.controller');

const fileFilter = function (req, file, cb) {
  if (!file.mimetype.startsWith('image/')) return cb(new Error('File harus berupa gambar'), false);
  cb(null, true);
};

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
  limits: { fileSize: 3 * 1024 * 1024 }
});

// kalau project lo punya middleware authRequired, pakai ini:
// const { authRequired } = require('../middlewares/auth.middleware');

router.get('/profile', profileController.profilePage);
router.get('/profile/password', profileController.passwordPage);
router.post('/profile/password', profileController.updatePassword);
router.post('/profile/athlete', uploadAthletePhoto.single('photo'), profileController.updateAthleteProfile);

router.get('/profile/tickets', profileController.myTicketsPage);
module.exports = router;
