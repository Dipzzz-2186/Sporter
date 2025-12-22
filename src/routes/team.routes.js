const express = require('express');
const router = express.Router();
const publicTeam = require('../controllers/publicTeam.controller');

router.get('/:id', publicTeam.show);

module.exports = router;
