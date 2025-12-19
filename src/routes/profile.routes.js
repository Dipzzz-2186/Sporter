const express = require('express');
const router = express.Router();

const profileController = require('../controllers/profile.controller');

// kalau project lo punya middleware authRequired, pakai ini:
// const { authRequired } = require('../middlewares/auth.middleware');

router.get('/profile', profileController.profilePage);
// router.post('/profile', profileController.updateProfile); // opsional

router.get('/profile/password', profileController.passwordPage);
router.post('/profile/password', profileController.updatePassword);

module.exports = router;
