const express = require("express");
const router = express.Router();

const storeCtrl = require("../controllers/store.controller");

// ⬇️ INI YANG KAMU LUPA
const { requireUser } = require("../middlewares/auth.middleware");

// STORE (public)
router.get("/store", storeCtrl.listProducts);
router.get("/store/:id", storeCtrl.productDetail);

module.exports = router;
