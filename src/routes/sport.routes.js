const express = require("express");
const router = express.Router();
const controller = require("../controllers/sport.controller");
const publicStandings = require('../controllers/publicStandings.controller');

// GET /sports
router.get("/", controller.renderSports);

// USER (read-only)
router.get('/standings', publicStandings.index);

// GET /sports/:slug
router.get("/:slug", controller.renderSportDetail);

module.exports = router;
