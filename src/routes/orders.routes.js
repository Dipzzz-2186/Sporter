const express = require('express');
const router = express.Router();
const orderCtrl = require('../controllers/order.controller');

router.get('/:id', orderCtrl.renderOrderDetail);
router.post('/:id/holders', orderCtrl.saveTicketHolders);

module.exports = router;
