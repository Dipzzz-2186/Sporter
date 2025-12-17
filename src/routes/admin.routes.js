// src/routes/admin.routes.js
const express = require("express");
const router = express.Router();

const path = require("path");
const fs = require("fs");
const multer = require("multer");

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

// ========== MULTER UNTUK UPLOAD THUMBNAIL NEWS ==========
const uploadsDir = path.join(__dirname, "..", "public", "uploads", "news");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = "news-" + Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, base + ext);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("File harus berupa gambar"), false);
  }
  cb(null, true);
};

const uploadNewsThumb = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024, // max 3MB
  },
});


// routes
router.get("/", authMiddleware.requireAdmin, adminController.renderDashboard);

// Events Management (Admin only)
router.get("/events", authMiddleware.requireAdmin, adminController.listEvents);
router.get("/events/create", authMiddleware.requireAdmin, adminController.renderCreateEvent);
router.post("/events/create", authMiddleware.requireAdmin, adminController.createEvent);

router.get("/events/:id/edit", authMiddleware.requireAdmin, adminController.renderEditEvent);
router.post("/events/:id/edit", authMiddleware.requireAdmin, adminController.updateEvent);

router.post("/events/:id/delete", authMiddleware.requireAdmin, adminController.deleteEvent);

// News management (admin only)
router.get(
  "/news",
  authMiddleware.requireAdmin,
  adminController.listNews
);

router.get(
  "/news/create",
  authMiddleware.requireAdmin,
  adminController.renderCreateNews
);

router.post(
  "/news/create",
  authMiddleware.requireAdmin,
  uploadNewsThumb.single("thumbnail"),   // <-- PENTING
  adminController.createNews
);

router.get(
  "/news/:id/edit",
  authMiddleware.requireAdmin,
  adminController.renderEditNews
);

router.post(
  "/news/:id/edit",
  authMiddleware.requireAdmin,
  uploadNewsThumb.single("thumbnail"),   // <-- PENTING
  adminController.updateNews
);

router.post(
  "/news/:id/delete",
  authMiddleware.requireAdmin,
  adminController.deleteNews
);

router.get("/news/:id/edit", authMiddleware.requireAdmin, adminController.renderEditNews);
router.post("/news/:id/edit", authMiddleware.requireAdmin, adminController.updateNews);

router.post("/news/:id/delete", authMiddleware.requireAdmin, adminController.deleteNews);

// Subadmin management (admin only)
router.get("/subadmins", authMiddleware.requireAdmin, adminController.listSubadmins);
router.get("/subadmins/create", authMiddleware.requireAdmin, adminController.renderCreateSubadmin);
router.post("/subadmins/create", authMiddleware.requireAdmin, adminController.createSubadmin);

// edit subadmin
router.get("/subadmins/:id/edit", adminController.renderEditSubadmin);
router.post("/subadmins/:id/edit", adminController.updateSubadmin);

// delete subadmin (optional)
router.post("/subadmins/:id/delete", authMiddleware.requireAdmin, adminController.deleteSubadmin);

// Seller management
router.get("/sellers", authMiddleware.requireAdmin, adminController.listSellers);
router.get("/sellers/create", authMiddleware.requireAdmin, adminController.renderCreateSeller);
router.post("/sellers/create", authMiddleware.requireAdmin, adminController.createSeller);

router.get("/sellers/:id/edit", authMiddleware.requireAdmin, adminController.renderEditSeller);
router.post("/sellers/:id/edit", authMiddleware.requireAdmin, adminController.updateSeller);

router.post("/sellers/:id/delete", authMiddleware.requireAdmin, adminController.deleteSeller);

// src/routes/admin.routes.js
router.get(
  '/matches',
  authMiddleware.requireAdmin,
  adminController.listMatchesReadOnly
);

router.get(
  '/standings',
  authMiddleware.requireAdmin,
  adminController.listStandingsReadOnly
);


module.exports = router;
