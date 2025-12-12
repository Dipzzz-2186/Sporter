const express = require('express');
const router = express.Router();

const publicStandings = require('../controllers/publicStandings.controller');

router.get('/standings', publicStandings.index);

module.exports = router;
