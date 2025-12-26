const express = require("express");
const router = express.Router();
const eventController = require("../controllers/event.controller");


router.get('/events', eventController.listEvents);
router.get('/events/:slugOrId/add-to-google', eventController.addToGoogleCalendar);
router.get('/events/:slugOrId', eventController.viewEvent);


module.exports = router;
