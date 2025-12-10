// src/routes/admin.routes.js
const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const authMiddleware = require("../middlewares/auth.middleware");

// sanity checks
if (!authMiddleware || typeof authMiddleware !== "object") {
  throw new Error("auth.middleware tidak ditemukan atau bukan object. Cek src/middlewares/auth.middleware.js");
}
if (!adminController || typeof adminController !== "object") {
  throw new Error("admin.controller tidak ditemukan atau bukan object. Cek src/controllers/admin.controller.js");
}
if (typeof authMiddleware.requireAdminOrSubadmin !== "function") {
  throw new Error("requireAdminOrSubadmin bukan function. Pastikan exports.requireAdminOrSubadmin ada di auth.middleware.");
}
if (typeof authMiddleware.requireAdmin !== "function") {
  throw new Error("requireAdmin bukan function. Pastikan exports.requireAdmin ada di auth.middleware.");
}
if (typeof adminController.renderDashboard !== "function") {
  throw new Error("renderDashboard bukan function. Pastikan exports.renderDashboard ada di admin.controller.");
}

// routes
router.get("/", authMiddleware.requireAdminOrSubadmin, adminController.renderDashboard);

// Subadmin management (admin only)
router.get("/subadmins", authMiddleware.requireAdmin, adminController.listSubadmins);
router.get("/subadmins/create", authMiddleware.requireAdmin, adminController.renderCreateSubadmin);
router.post("/subadmins/create", authMiddleware.requireAdmin, adminController.createSubadmin);

// delete subadmin (optional)
router.post("/subadmins/:id/delete", authMiddleware.requireAdmin, adminController.deleteSubadmin);

module.exports = router;
