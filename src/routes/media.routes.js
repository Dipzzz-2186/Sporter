const express = require("express");
const router = express.Router();
const mediaCtrl = require("../controllers/media.controller");

// LIST PAGES
router.get("/videos", mediaCtrl.listVideos);
router.get("/livestreams", mediaCtrl.listLivestreams);

// DETAIL PAGES
router.get("/videos/:id", mediaCtrl.viewVideo);
router.get("/livestreams/:id", mediaCtrl.viewLivestream);

module.exports = router;
