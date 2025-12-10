// src/routes/news.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/news.controller");

// GET /news
router.get("/", controller.renderNewsList);

// GET /news/:slug
router.get("/:slug", controller.renderNewsDetail);

module.exports = router;
