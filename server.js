require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import DB (percorso confermato dagli screen precedenti)
const db = require('./src/db');

// --- Moduli Riorganizzati (che hai già creato) ---
const phrasesRoutes = require('./src/routes/motivazionalRoute'); 
const motivationalAppHandler = require('./src/middleware/motivationalMiddleware'); 

// --- Route Modules Esistenti ---
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

// 1. Middleware App Motivazionale (Priorità Alta)
// Intercetta il dominio motivazionale PRIMA di tutto il resto
// Serve i file da 'public/motivazional' o gestisce le API specifiche
app.use(motivationalAppHandler);

// 2. API Routes
// La route /api/sync-phrases è ora gestita dentro phrasesRoutes
app.use('/api', phrasesRoutes); 
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// 3. Static Files Generali (Dominio Principale)
// Serve tutto il contenuto di 'public' per il sito principale
// (Nota: 'motivazional' è ignorata qui perché gestita sopra)
app.use(express.static('public'));

// 4. Redirects & Fallback
app.use('/', redirectRoutes);
// Fallback per file nella root (se ne hai ancora bisogno per legacy)
app.use(express.static('.')); 

// --- AVVIO SERVER ---
app.listen(PORT, () => {
    console.log(`Server is stable and running on port ${PORT}`);
    console.log('✅ Configurazione modulare attiva.');
});


