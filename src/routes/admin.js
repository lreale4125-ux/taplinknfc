const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
    adjustBalance,
    getCompanies,
    createCompany,
    createLink,
    getLinks, // Questa funzione verrà modificata in adminController.js
    getUsers,
    createUser,
    deleteUser,
    getAnalyticsSummary,
    getAnalyticsDetail,
    generateQrCode,
    
    // --- NUOVE IMPORTAZIONI PER I SELETTORI ---
    createSelector,
    getSelectors,
    updateSelector,
    deleteSelector,
    getLinksWithQr // Nuova funzione per la gestione/filtro link creati
} = require('../controllers/adminController'); // Assicurati di aggiungere queste funzioni in adminController.js

const router = express.Router();

// --- NUOVE ROTTE PER LA GESTIONE DEI SELETTORI ---
// Recupera tutti i selettori per popolare i menu a tendina
router.get('/selectors', authenticateToken, requireAdmin, getSelectors);
// Crea un nuovo selettore
router.post('/selectors', authenticateToken, requireAdmin, createSelector);
// Modifica l'URL di un selettore (Chiave per l'aggiornamento massivo dei redirect)
router.put('/selectors/:id', authenticateToken, requireAdmin, updateSelector);
// Elimina un selettore
router.delete('/selectors/:id', authenticateToken, requireAdmin, deleteSelector);
// ---------------------------------------------------


// Rotta per la generazione del QR Code (utilizza il Controller)
router.post('/generate-qr/:keychainId', authenticateToken, requireAdmin, generateQrCode);

// Adjust balance route
router.post('/adjust-balance', authenticateToken, requireAdmin, adjustBalance);

// Companies routes
router.get('/companies', authenticateToken, requireAdmin, getCompanies);
router.post('/companies', authenticateToken, requireAdmin, createCompany);

// Links routes
router.post('/links', authenticateToken, requireAdmin, createLink);
// Modifichiamo l'endpoint GET per la "Gestione Link Creati"
// Uso un endpoint dedicato che include i dati del Selettore e la disponibilità del QR.
router.get('/links-with-qr', authenticateToken, requireAdmin, getLinksWithQr);
// Manteniamo la rotta originale /links solo se è usata altrove, altrimenti la rimuoviamo/modifichiamo
router.get('/links', authenticateToken, requireAdmin, getLinks);


// Users routes
router.get('/users', authenticateToken, requireAdmin, getUsers);
router.post('/users', authenticateToken, requireAdmin, createUser);
router.delete('/users/:id', authenticateToken, requireAdmin, deleteUser);

// Analytics report routes
router.get('/analytics/report/summary/:linkId', authenticateToken, requireAdmin, getAnalyticsSummary);
router.get('/analytics/report/detail/:linkId', authenticateToken, requireAdmin, getAnalyticsDetail);

module.exports = router;
