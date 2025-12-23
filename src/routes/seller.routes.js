const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "public", "uploads", "merchandise");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `merch-${crypto.randomUUID()}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Hanya file gambar yang diperbolehkan"));
        }
        cb(null, true);
    }
});

const sellerController = require("../controllers/seller.controller");
const authMiddleware = require("../middlewares/auth.middleware");

// ==================
// AUTH GUARD
// ==================
if (typeof authMiddleware.requireSeller !== "function") {
    throw new Error("requireSeller middleware tidak ditemukan");
}

// ==================
// DASHBOARD
// ==================
router.get(
    "/",
    authMiddleware.requireSeller,
    sellerController.dashboard
);

// ==================
// MERCHANDISE CRUD
// ==================
router.get(
    "/merchandise",
    authMiddleware.requireSeller,
    sellerController.listMerchandise
);

router.get(
    "/merchandise/create",
    authMiddleware.requireSeller,
    sellerController.renderCreateMerchandise
);

router.post(
    "/merchandise/create",
    authMiddleware.requireSeller,
    upload.array("images", 10),
    sellerController.createMerchandise
);

router.get(
    "/merchandise/:id/edit",
    authMiddleware.requireSeller,
    sellerController.renderEditMerchandise
);

router.post(
    "/merchandise/:id/edit",
    authMiddleware.requireSeller,
    upload.array("images", 10),
    sellerController.updateMerchandise
);

router.post(
    "/merchandise/:id/delete",
    authMiddleware.requireSeller,
    sellerController.deleteMerchandise
);

// ==================
// ORDERS
// ==================
router.get(
    "/orders",
    authMiddleware.requireSeller,
    sellerController.listOrders
);

router.post(
    "/orders/:id/status",
    authMiddleware.requireSeller,
    sellerController.updateOrderStatus
);

router.get(
    "/orders/:id/detail",
    authMiddleware.requireSeller,
    sellerController.orderDetailJson
);

module.exports = router;
