const express = require('express');
const router = express.Router();
const favoritesController = require('../controllers/favorites.controller');

// ✅ HALAMAN FAVORITES
router.get('/me/favorites', favoritesController.myFavoritesPage);

// ✅ TOGGLE FAVORITE (INI YANG BIKIN ERROR TADI)
router.post('/favorites/toggle', favoritesController.toggleFavorite);

module.exports = router;
