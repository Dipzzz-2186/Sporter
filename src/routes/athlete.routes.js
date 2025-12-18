const express = require('express');
const router = express.Router();

// ✅ Sesuaikan dengan nama file yang benar
const publicAthleteController = require('../controllers/publicAthlete.controller');

router.get('/:slug', publicAthleteController.show);

module.exports = router;