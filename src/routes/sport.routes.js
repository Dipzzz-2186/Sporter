const express = require("express");
const router = express.Router();
const controller = require("../controllers/sport.controller");

// GET /sports
router.get("/", controller.renderSports);

// GET /sports/:slug
router.get("/:slug", controller.renderSportDetail);

module.exports = router;
