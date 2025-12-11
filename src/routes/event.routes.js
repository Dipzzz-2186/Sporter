const express = require("express");
const router = express.Router();
const eventController = require("../controllers/event.controller");

// Public event pages
router.get("/events", eventController.listEvents);
router.get("/events/:slugOrId", eventController.viewEvent);

module.exports = router;
