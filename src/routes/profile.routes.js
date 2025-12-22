const express = require('express');
const router = express.Router();

const profileController = require('../controllers/profile.controller');

// kalau project lo punya middleware authRequired, pakai ini:
// const { authRequired } = require('../middlewares/auth.middleware');

router.get('/profile', profileController.profilePage);
router.get('/profile/password', profileController.passwordPage);
router.post('/profile/password', profileController.updatePassword);

router.get('/profile/tickets', profileController.myTicketsPage);
module.exports = router;
