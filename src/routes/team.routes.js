const express = require('express');
const router = express.Router();
const controller = require('../controllers/publicTeam.controller');

router.get('/:id', controller.show);

module.exports = router;
