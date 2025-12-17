const express = require('express');
const router = express.Router();

const controller = require('../controllers/publicAthlete.controller');

// Public athlete profile page
router.get('/:slug', controller.show);

module.exports = router;
