// --- VERSIONE FINALE, PULITA E CORRETTA ---

// Import dei moduli
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import custom modules
const db = require('./database');
const { authenticateToken } = require('./auth');
const { handleMotivationalRequest } = require('./motivational');

// Import route modules
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const redirectRoutes = require('./routes/redirects');

const PORT = process.env.PORT || 3001;

// --- VERIFICA VARIABILI D'AMBIENTE ---
if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in your .env file.');
    process.exit(1);
}

// --- Creazione app Express e Middleware ---
const app = express();

// Middleware di parsing
app.use(express.json());
app.use(cors());

// --- MIDDLEWARE PER GESTIRE IL SITO MOTIVAZIONALE ---
// Questo middleware intercetta le richieste *prima* del server statico
app.use(async (req, res, next) => {
    // Controlla se la richiesta arriva dal dominio motivazionale
    if (req.hostname === 'motivazional.taplinknfc.it' || req.hostname === 'www.motivazional.taplinknfc.it') {
        await handleMotivationalRequest(req, res);
    } else {
        // Se NON è il dominio motivazionale, procedi normalmente
        next();
    }
});

// Serve static files
app.use(express.static('.'));

// --- ROUTE API ---
// Authentication routes
app.use('/api/auth', authRoutes);

// User routes
app.use('/api/user', userRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Redirect routes
app.use('/', redirectRoutes);

// --- AVVIO DEL SERVER ---
app.listen(PORT, () => {
    console.log(`Server is stable and running on port ${PORT}`);
});
