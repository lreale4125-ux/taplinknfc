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
    // Controlla se la richiesta arriva dal dominio motivazionale
    if (req.hostname === 'motivazional.taplinknfc.it' || req.hostname === 'www.motivazional.taplinknfc.it') {
        
        // 1. GESTIONE DELLA RICHIESTA API ASINCRONA
        if (req.path === '/api/quote') {
            // Chiama la funzione API e risponde immediatamente
            return getQuoteOnly(req, res); 
        }
        
        // 2. GESTIONE DELLA ROOT (Caricamento HTML iniziale)
        if (req.path === '/') {
            // Chiama il gestore della pagina HTML
            return handleMotivationalRequest(req, res);
        } 
        
        // 3. SE NON È NÉ / NÉ /api/quote, restituisce 404 specifico per il dominio motivazionale
        return res.status(404).send('Pagina non trovata.');
        
    } else {
        // Se NON è il dominio motivazionale, procedi con le altre route
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
