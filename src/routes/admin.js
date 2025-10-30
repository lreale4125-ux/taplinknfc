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
    getAnalyticsDetail,
    generateQrCode, // Questa è la vecchia funzione, la lasciamo se serve
    
    // --- IMPORTAZIONI AGGIUNTE ---
    createSelector,
    getSelectors,
    updateSelector,
    deleteSelector,
    getLinksWithQr,
    createKeychainQr // <-- NUOVO: Endpoint per associare Link e QR
} = require('../controllers/adminController');

const router = express.Router();

// --- Rotte per i Selettori (NUOVE) ---
router.get('/selectors', authenticateToken, requireAdmin, getSelectors);
router.post('/selectors', authenticateToken, requireAdmin, createSelector);
router.put('/selectors/:id', authenticateToken, requireAdmin, updateSelector);
router.delete('/selectors/:id', authenticateToken, requireAdmin, deleteSelector);

// --- Rotta per associazione QR (NUOVA) ---
router.post('/create-keychain-qr', authenticateToken, requireAdmin, createKeychainQr);

// Rotta per la generazione del QR Code (vecchia, per QR motivazionali)
router.post('/generate-qr/:keychainId', authenticateToken, requireAdmin, generateQrCode);

// Adjust balance route
router.post('/adjust-balance', authenticateToken, requireAdmin, adjustBalance);

// Companies routes
router.get('/companies', authenticateToken, requireAdmin, getCompanies);
router.post('/companies', authenticateToken, requireAdmin, createCompany);

// Links routes
router.post('/links', authenticateToken, requireAdmin, createLink);
router.get('/links-with-qr', authenticateToken, requireAdmin, getLinksWithQr); // Nuovo endpoint per la tabella
router.get('/links', authenticateToken, requireAdmin, getLinks); // Vecchio endpoint

// Users routes
router.get('/users', authenticateToken, requireAdmin, getUsers);
router.post('/users', authenticateToken, requireAdmin, createUser);
router.delete('/users/:id', authenticateToken, requireAdmin, deleteUser);

// Analytics report routes
router.get('/analytics/report/summary/:linkId', authenticateToken, requireAdmin, getAnalyticsSummary);
router.get('/analytics/report/detail/:linkId', authenticateToken, requireAdmin, getAnalyticsDetail);

module.exports = router;
