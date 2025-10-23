// --- TAPLINKNFC SERVER ENTRY POINT (CORRETTO) ---

// Import moduli essenziali
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Carica .env dalla root

// Import custom modules
const db = require('./db'); // Assicurati che questo esista e sia corretto
const { authenticateToken } = require('./middleware/auth'); // Assicurati che questo esista e sia corretto
// NOTA CHIAVE: Importiamo handleMotivationalRequest E getQuoteOnly
const { handleMotivationalRequest, getQuoteOnly } = require('./services/motivational'); 

// Import route modules
const authRoutes = require('./routes/auth'); // Assicurati che questo esista e sia corretto
const userRoutes = require('./routes/user'); // Assicurati che questo esista e sia corretto
const adminRoutes = require('./routes/admin'); // Assicurati che questo esista e sia corretto
const redirectRoutes = require('./routes/redirects'); // Assicurati che questo esista e sia corretto

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
// MIDDLEWARE PER GESTIRE IL SITO MOTIVAZIONALE (LOGICA AGGIUSTATA)
// Questo middleware gestisce sia la pagina principale che l'API.
// ===================================================================
app.use(async (req, res, next) => {
    // 1. Controlla se la richiesta arriva dal dominio motivazionale
    if (req.hostname === 'motivazional.taplinknfc.it' || req.hostname === 'www.motivazional.taplinknfc.it') {
        
        // 1.1. GESTIONE DELLA RICHIESTA API ASINCRONA
        if (req.path === '/api/quote') {
            // Chiama la funzione API che restituisce JSON. Il 404 viene risolto qui.
            return getQuoteOnly(req, res); 
        }
        
        // 1.2. GESTIONE DELLA ROOT (Caricamento HTML iniziale)
        if (req.path === '/') {
            // Chiama il gestore della pagina HTML.
            return handleMotivationalRequest(req, res);
        } 
        
        // 1.3. Se NON è una rotta gestita (/ o /api/quote), risponde 404 e si ferma.
        return res.status(404).send('Pagina o risorsa API non trovata sul dominio motivazionale.');
        
    } else {
        // Se NON è il dominio motivazionale, procedi con le altre route
        next();
    }
});
// ===================================================================

// Serve static files (dalla directory public che si trova una cartella sopra)
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- ROUTE API (Per il dominio principale taplinknfc.it) ---
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// Redirect routes
app.use('/', redirectRoutes);

// Error handling middleware (per errori interni non gestiti)
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler (Catch-all per le rotte del dominio principale non trovate)
app.use((req, res) => {
    // Se la richiesta arriva qui, significa che non è stata intercettata da nessuna rotta (inclusa quella motivazionale)
    res.status(404).json({ error: 'Route not found' });
});

// Avvio del server
app.listen(PORT, () => {
    console.log(`Server is stable and running on port ${PORT}`);
});
