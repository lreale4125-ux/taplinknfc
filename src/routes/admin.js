const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { resetTestData } = require('../db'); // 🎯 1. IMPORTAZIONE DELLA FUNZIONE DI RESET

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
    generateQrCode, 
    
    // --- IMPORTAZIONI AGGIUNTE ---
    createSelector,
    getSelectors,
    updateSelector,
    deleteSelector,
    getLinksWithQr,
    createKeychainQr
} = require('../controllers/adminController');

const router = express.Router();

// --- Rotta per il RESET DATI DI TEST (NUOVA) ---
// Protezione: Solo admin e con token valido
router.post('/reset-data', authenticateToken, requireAdmin, (req, res) => {
    try {
        resetTestData(); // Chiama la funzione di reset importata
        res.json({ message: 'Reset dei dati di test eseguito con successo. Utenti, analytics e transazioni cancellati.' });
    } catch (error) {
        console.error('Errore durante il reset dei dati:', error);
        res.status(500).json({ error: 'Errore interno del server durante il reset.' });
    }
});

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
