// --- SERVER.JS CORRETTO E COMPLETO --- //

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./src/db');
const jwt = require('jsonwebtoken');
const { handleMotivationalRequest, getQuoteOnly, updateUserNickname } = require('./src/services/motivational');

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

// 🎯 ROUTE PER SINCRONIZZAZIONE FRASI DA N8N (DEVE STARE PRIMA del middleware motivazionale)
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

// In src/index.js o server.js - MODIFICA SOLO il middleware motivazionale

app.use(async (req, res, next) => {
    const motiDomains = ['motivazional.taplinknfc.it', 'www.motivazional.taplinknfc.it'];

    if (!motiDomains.includes(req.hostname)) {
        return next();
    }

    // 🎯 MANTIENI le API ESISTENTI - non cambiano!
    if (req.path === '/api/quote') {
        return await getQuoteOnly(req, res);
    }

    if (req.path === '/api/update-nickname' && req.method === 'POST') {
        return await updateUserNickname(req, res);
    }

    // 🎯 PER TUTTE LE ALTRE ROUTE → SERVE REACT SPA
    // Invece di handleMotivationalRequest, servi i file React
    if (req.path === '/' || req.path.startsWith('/static/') || req.path === '/motivazionale') {
        return express.static(path.join(__dirname, '..', 'react-motivational-build'))(req, res, next);
    }

    // Fallback: per qualsiasi altra route, servi index.html di React
    res.sendFile(path.join(__dirname, '..', 'react-motivational-build', 'index.html'));
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
    console.log('✅ Route /api/sync-phrases ATTIVA per N8N');
});


