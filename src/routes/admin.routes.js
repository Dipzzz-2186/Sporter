const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const {
  requireAdminOrSubadmin,
} = require("../middlewares/auth.middleware");

// semua route admin pakai proteksi
router.get("/", requireAdminOrSubadmin, adminController.renderDashboard);

module.exports = router;
