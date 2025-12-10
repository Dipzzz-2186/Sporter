// src/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/auth.controller");

// Halaman login
router.get("/login", controller.renderLogin);

// Proses login
router.post("/login", controller.handleLogin);

// Logout
router.get("/logout", controller.handleLogout);

module.exports = router;
