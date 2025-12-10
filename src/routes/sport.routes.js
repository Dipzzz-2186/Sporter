// src/routes/sport.routes.js
const express = require("express");
const router = express.Router();

// sementara: just test
router.get("/", (req, res) => {
  res.send("Sports route jalan!");
});

module.exports = router;
