const express = require('express');
const { authenticateToken, requireWallet, requireAnalytics, requirePos } = require('../middleware/auth');
const {
    getWallet,
    getLinks,
    getAnalytics,
    getHeatmap,
    processPayment,
    getGeostats
} = require('../controllers/userController');

const router = express.Router();

// Wallet route
router.get('/wallet', authenticateToken, requireWallet, getWallet);

// Links route
router.get('/links', authenticateToken, requireAnalytics, getLinks);

// Analytics route
router.get('/analytics/:linkId', authenticateToken, requireAnalytics, getAnalytics);

// Heatmap route
router.get('/heatmap/:linkId', authenticateToken, requireAnalytics, getHeatmap);

// POS payment route
router.post('/transactions/payment', authenticateToken, requirePos, processPayment);

// Geostats route
router.get('/geostats/:linkId', authenticateToken, requireAnalytics, getGeostats);

module.exports = router;