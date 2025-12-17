const express = require('express');
const router = express.Router();
const purchaseCtrl = require('../controllers/purchase.controller');

// POST beli tiket
router.post('/buy', purchaseCtrl.buyTicket);

module.exports = router;
