// --- VERSIONE FINALE, PULITA E CORRETTA ---

// Import dei moduli
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import custom modules
const db = require('./src/db');
const { authenticateToken } = require('./src/middleware/auth');
// Importiamo entrambe le funzioni del servizio motivazionale
const { handleMotivationalRequest, getQuoteOnly } = require('./src/services/motivational'); 

// Import route modules
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/user');
const adminRoutes = require('./src/routes/admin');
const redirectRoutes = require('./src/routes/redirects');

const PORT = process.env.PORT || 3001;

// --- VERIFICA VARIABILI D'AMBIENTE ---
if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in your .env file.');
    process.exit(1);
}

// --- Creazione app Express e Middleware ---
const app = express();

// Middleware di parsing e CORS
app.use(express.json());
app.use(cors());

// --- MIDDLEWARE SPECIFICO PER IL SITO MOTIVAZIONALE ---
// Questo middleware intercetta le richieste *prima* del server statico
app.use(async (req, res, next) => {
    const motiDomain = ['motivazional.taplinknfc.it', 'www.motivazional.taplinknfc.it'];
    
    if (motiDomain.includes(req.hostname)) {

        // --- 1. API Motivazionale ---
        if (req.path === '/api/quote') {
            try {
                return await getQuoteOnly(req, res);
            } catch (err) {
                console.error('[MOTIVAZIONAL] Errore API quote:', err);
                return res.status(500).json({ error: 'Errore interno API motivazionale' });
            }
        }

        // --- 2. Root HTML Motivazionale ---
        if (req.path === '/') {
            try {
                return await handleMotivationalRequest(req, res);
            } catch (err) {
                console.error('[MOTIVAZIONAL] Errore generazione pagina:', err);
                return res.status(500).send('Errore interno nel sito motivazionale');
            }
        }

        // --- 3. Altri percorsi sul dominio motivazionale: 404 ---
        return res.status(404).send('Pagina non trovata sul sito motivazionale');

    } else {
        // Non è dominio motivazionale: passa alle altre route
        next();
    }
});

// Serve static files
app.use(express.static('.'));

// --- ROUTE API (non include più /api/quote perché gestito dal middleware motivazionale) ---
// Authentication routes
app.use('/api/auth', authRoutes);

// User routes
app.use('/api/user', userRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Redirect routes generiche
app.use('/', redirectRoutes);

// --- AVVIO DEL SERVER ---
app.listen(PORT, () => {
    console.log(`Server is stable and running on port ${PORT}`);
});

