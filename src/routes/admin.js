const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
    adjustBalance,
    getCompanies,
    createCompany,
    createLink,
    getLinks,
    getUsers,
    createUser,
    deleteUser,
    getAnalyticsSummary,
    getAnalyticsDetail
} = require('../controllers/adminController');

const router = express.Router();

// Adjust balance route
router.post('/adjust-balance', authenticateToken, requireAdmin, adjustBalance);

// Companies routes
router.get('/companies', authenticateToken, requireAdmin, getCompanies);
router.post('/companies', authenticateToken, requireAdmin, createCompany);

// Links routes
router.post('/links', authenticateToken, requireAdmin, createLink);
router.get('/links', authenticateToken, requireAdmin, getLinks);

// Users routes
router.get('/users', authenticateToken, requireAdmin, getUsers);
router.post('/users', authenticateToken, requireAdmin, createUser);
router.delete('/users/:id', authenticateToken, requireAdmin, deleteUser);

// Analytics report routes
router.get('/analytics/report/summary/:linkId', authenticateToken, requireAdmin, getAnalyticsSummary);
router.get('/analytics/report/detail/:linkId', authenticateToken, requireAdmin, getAnalyticsDetail);

module.exports = router;