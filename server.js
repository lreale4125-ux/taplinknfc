// --- SERVER.JS PULITO E COMPLETO --- //

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./src/db');
const { authenticateToken } = require('./src/middleware/auth');
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

    // Controllo token JWT opzionale per pagine motivazionali
    let userPayload = null;
    if (req.headers.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];
        try {
            userPayload = authenticateToken(token);
            if (userPayload.role !== 'motivational') {
                return res.status(403).send('Accesso negato: ruolo non autorizzato.');
            }
        } catch (err) {
            return res.status(401).send('Token non valido o scaduto.');
        }
    }

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
            return await handleMotivationalRequest(req, res, userPayload);
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
