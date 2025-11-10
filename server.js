// --- SERVER.JS PULITO E COMPLETO --- //

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./src/db');
// Nota: 'authenticateToken' non è più necessaria qui se gestiamo il token in motivational.js
// La riga è stata commentata se non definita da un altro file
// const { authenticateToken } = require('./src/middleware/auth'); 
const jwt = require('jsonwebtoken'); // Necessario per la verifica opzionale nel middleware
const { handleMotivationalRequest, getQuoteOnly } = require('./src/services/motivational');

// Route modules
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/user');
const adminRoutes = require('./src/routes/admin');
const redirectRoutes = require('./src/routes/redirects');

const PORT = process.env.PORT || 3001;

// Verifica variabili d'ambiente
if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in your .env file.');
    process.exit(1);
}

// --- Creazione app Express ---
const app = express();
app.use(express.json());
app.use(cors());

// --- MIDDLEWARE PER DOMINIO MOTIVAZIONALE ---
app.use(async (req, res, next) => {
    const motiDomains = ['motivazional.taplinknfc.it', 'www.motivazional.taplinknfc.it'];

    if (!motiDomains.includes(req.hostname)) {
        return next(); // Non è dominio motivazionale
    }

    // Nota: La gestione del token JWT è stata spostata interamente in motivational.js
    // per gestire sia token in query che in header. Qui ci concentriamo sul routing.

    // 1. API Motivazionale
    if (req.path === '/api/quote') {
        try {
            return await getQuoteOnly(req, res);
        } catch (err) {
            console.error('[MOTIVAZIONAL] Errore API quote:', err);
            return res.status(500).json({ error: 'Errore interno API motivazionale' });
        }
    }

    // 2. Root HTML Motivazionale
    if (req.path === '/') {
        try {
            // handleMotivationalRequest ora gestisce l'autenticazione internamente
            return await handleMotivationalRequest(req, res);
        } catch (err) {
            console.error('[MOTIVAZIONAL] Errore generazione pagina:', err);
            return res.status(500).send('Errore interno nel sito motivazionale');
        }
    }

    // 3. Altri percorsi: 404
    return res.status(404).send('Pagina non trovata sul sito motivazionale');
});

// Serve static files
app.use(express.static('.'));

// --- ROUTE API STANDARD ---
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/', redirectRoutes);

// --- AVVIO SERVER ---
app.listen(PORT, () => {
    console.log(`Server is stable and running on port ${PORT}`);
});
