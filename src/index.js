// --- TAPLINKNFC SERVER ENTRY POINT (CORRETTO) ---

// Import moduli essenziali
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Import custom modules
const db = require('./db');
const { authenticateToken } = require('./middleware/auth');
const { handleMotivationalRequest, getQuoteOnly, updateUserNickname } = require('./services/motivational');

// Import route modules
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const redirectRoutes = require('./routes/redirects');

// 🎯 IMPORT AUTH CONTROLLER PER GOOGLE OAUTH
const authController = require('./controllers/authController');

// Environment validation
if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in your .env file.');
    process.exit(1);
}

const PORT = process.env.PORT || 3001;

// Creazione app Express
const app = express();

// Middleware di base
app.use(express.json());
app.use(cors());

// ===================================================================
// MIDDLEWARE PER GESTIRE IL SITO MOTIVAZIONALE (LOGICA CORRETTA)
// ===================================================================
app.use(async (req, res, next) => {
    // 1. Controlla se la richiesta arriva dal dominio motivazionale
    if (req.hostname === 'motivazional.taplinknfc.it' || req.hostname === 'www.motivazional.taplinknfc.it') {
        
        // 🎯 CORREZIONE: Gestisce sia / che /motivazionale per il sottodominio
        if (req.path === '/' || req.path === '/motivazionale') {
            // Chiama il gestore della pagina HTML.
            return handleMotivationalRequest(req, res);
        }
        
        // 1.1. GESTIONE DELLA RICHIESTA API ASINCRONA
        if (req.path === '/api/quote') {
            // Chiama la funzione API che restituisce JSON.
            return getQuoteOnly(req, res); 
        }
        
        // 🎯 AGGIUNGI QUESTA NUOVA ROUTE PER IL NICKNAME
        if (req.path === '/api/update-nickname' && req.method === 'POST') {
            return updateUserNickname(req, res);
        }
        
        // 1.2. Se NON è una rotta gestita, risponde 404 e si ferma.
        return res.status(404).send('Pagina o risorsa API non trovata sul dominio motivazionale.');
        
    } else {
        // Se NON è il dominio motivazionale, procedi con le altre route
        next();
    }
});
// ===================================================================

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- ROUTE API (Per il dominio principale taplinknfc.it) ---
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// 🎯 ROUTE PER SINCRONIZZAZIONE FRASI DA N8N (DEVE STARE QUI - accessibile da tutti i domini)
app.post('/api/sync-phrases', async (req, res) => {
    try {
        const phrases = req.body;
        
        if (!Array.isArray(phrases)) {
            return res.status(400).json({ error: 'Dati non validi' });
        }
        
        // Mappa categorie N8N → SQLite
        function mapCategory(n8nCategory) {
            const categoryMap = {
                'motivazione_personale': 'motivazione',
                'studio_apprendimento': 'studio', 
                'successo_resilienza': 'successo'
            };
            return categoryMap[n8nCategory] || 'motivazione';
        }
        
        // Pulisci tabella esistente
        db.prepare('DELETE FROM motivational_phrases').run();
        
        // Inserisci nuove frasi
        const insertStmt = db.prepare(`
            INSERT INTO motivational_phrases (phrase_text, category, author) 
            VALUES (?, ?, ?)
        `);
        
        let insertedCount = 0;
        for (const phrase of phrases) {
            try {
                const mappedCategory = mapCategory(phrase.Categoria);
                insertStmt.run(phrase.Frase, mappedCategory, phrase.Autori);
                insertedCount++;
            } catch (error) {
                console.warn(`Errore inserimento frase: ${phrase.Frase?.substring(0, 50)}`);
            }
        }
        
        console.log(`✅ Sincronizzate ${insertedCount} frasi nel database`);
        res.json({ success: true, count: insertedCount });
        
    } catch (error) {
        console.error("❌ Errore sincronizzazione frasi:", error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// 🎯 ROUTE GOOGLE OAUTH - CORRETTE
app.get('/api/auth/google', authController.googleAuth);  // Avvia il flusso
app.get('/api/auth/google/callback', authController.googleAuthCallback); // Gestisce il callback

// 🎯 ROUTE PER LA PAGINA MOTIVAZIONALE SUL DOMINIO PRINCIPALE
app.get('/motivazionale', (req, res) => {
    // Reindirizza al sottodominio motivazionale
    res.redirect('https://motivazional.taplinknfc.it');
});

// Redirect routes
app.use('/', redirectRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Avvio del server
app.listen(PORT, () => {
    console.log(`Server is stable and running on port ${PORT}`);
});
