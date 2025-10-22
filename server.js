// --- VERSIONE FINALE, PULITA E CORRETTA ---

// Import dei moduli
const geoip = require('geoip-lite');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const UAParser = require('ua-parser-js');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const PORT = process.env.PORT || 3001;

// --- VERIFICA VARIABILI D'AMBIENTE ---
if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in your .env file.');
    process.exit(1);
}

// --- CONFIGURAZIONE DATABASE ---
let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
    console.warn('GEMINI_API_KEY non trovata nel .env. Le funzioni motivazionali non funzioneranno.');
}

let db;
try {
    db = new Database('./database.db');
    db.pragma('journal_mode = WAL');
    console.log('Connected to SQLite database using better-sqlite3.');
} catch (err) {
    console.error('FATAL ERROR: Could not connect to database.', err);
    process.exit(1);
}

// --- INIZIALIZZAZIONE DATABASE ---
function initializeDatabase() {
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS companies ( 
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT NOT NULL UNIQUE, 
            description TEXT, 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP )`);
        db.exec(`CREATE TABLE IF NOT EXISTS users ( 
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            username TEXT UNIQUE NOT NULL, 
            email TEXT UNIQUE NOT NULL, 
            password TEXT NOT NULL, 
            role TEXT DEFAULT 'user', 
            company_id INTEGER, 
            balance_tap REAL DEFAULT 0, 
            loyalty_points INTEGER DEFAULT 0, 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
            FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL )`);
        
        try { db.exec(`ALTER TABLE users ADD COLUMN can_access_wallet INTEGER DEFAULT 1`); } catch (e) { /* ignora */ }
        try { db.exec(`ALTER TABLE users ADD COLUMN can_access_analytics INTEGER DEFAULT 0`); } catch (e) { /* ignora */ }
        try { db.exec(`ALTER TABLE users ADD COLUMN can_access_pos INTEGER DEFAULT 0`); } catch (e) { /* ignora */ }
        
        db.exec(`CREATE TABLE IF NOT EXISTS links ( 
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT NOT NULL, url TEXT NOT NULL, 
            description TEXT, 
            company_id INTEGER NOT NULL, 
            created_by INTEGER NOT NULL, 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
            FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE, 
            FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE )`);
            
        db.exec(`CREATE TABLE IF NOT EXISTS keychains ( 
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            user_id INTEGER NOT NULL, 
            link_id INTEGER NOT NULL, 
            keychain_number TEXT, 
            data TEXT, 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE, 
            FOREIGN KEY (link_id) REFERENCES links (id) ON DELETE CASCADE )`);
   
        db.exec(`CREATE TABLE IF NOT EXISTS analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keychain_id INTEGER,
            link_id INTEGER NOT NULL,
            ip_address TEXT NOT NULL,
            user_agent TEXT,
            referrer TEXT,
            country TEXT,
            city TEXT,
            click_count INTEGER DEFAULT 1 NOT NULL,
            first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (keychain_id) REFERENCES keychains (id) ON DELETE SET NULL,
            FOREIGN KEY (link_id) REFERENCES links (id) ON DELETE CASCADE,
            UNIQUE(link_id, ip_address, keychain_id))`);
            
            try { db.exec(`ALTER TABLE analytics ADD COLUMN os_name TEXT`); } catch (e) { /* ignora se esiste già */ }
            try { db.exec(`ALTER TABLE analytics ADD COLUMN browser_name TEXT`); } catch (e) { /* ignora se esiste già */ }
            try { db.exec(`ALTER TABLE analytics ADD COLUMN device_type TEXT`); } catch (e) { /* ignora se esiste già */ }
            // ... dopo le altre ALTER TABLE per analytics ...
            try { db.exec(`ALTER TABLE analytics ADD COLUMN lat REAL`); } catch (e) { /* ignora se esiste già */ }
            try { db.exec(`ALTER TABLE analytics ADD COLUMN lon REAL`); } catch (e) { /* ignora se esiste già */ }
        
        db.exec(`CREATE TABLE IF NOT EXISTS transactions ( 
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            user_id INTEGER NOT NULL, 
            tap_change REAL NOT NULL, 
            points_change INTEGER DEFAULT 0, 
            type TEXT NOT NULL, description TEXT, 
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE )`);
        
        const stmtCompany = db.prepare(`INSERT OR IGNORE INTO companies (id, name, description) VALUES (1, 'Default Company', 'Default company for new users')`);
        stmtCompany.run();
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        const stmtUser = db.prepare(`INSERT OR IGNORE INTO users (username, email, password, role, company_id, can_access_wallet, can_access_analytics, can_access_pos) VALUES (?, ?, ?, ?, ?, 1, 1, 1)`);
        stmtUser.run('admin', 'admin@example.com', hashedPassword, 'admin', 1);
        console.log('Database initialized successfully.');
    } catch (err) {
        if (!err.message.includes('duplicate column name')) {
            console.error('Error initializing database:', err.message);
        }
    }
}
initializeDatabase();

// --- FUNZIONE HELPER PER GEMINI ---
async function getMotivationalQuote(keychainId) {
    if (!genAI) return "La motivazione è dentro di te, non smettere di cercarla."; // Fallback

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `Sei un coach motivazionale. Genera una frase motivazionale breve (massimo 2 frasi) e di grande impatto per l'utente "ID-${keychainId}". Non includere saluti o convenevoli, solo la frase.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Errore durante la chiamata a Gemini:", error.message);
        return "La motivazione è dentro di te, non smettere di cercarla."; // Fallback
    }
}
// --- FUNZIONE TEMPORANEA PER DIAGNOSI ---
async function listAvailableModels() {
    if (!genAI) {
        console.error("[DIAGNOSI] genAI non inizializzato.");
        return;
    }
    try {
        console.log("[DIAGNOSI] Provo a listare i modelli...");

        // NOTA: La libreria @google/generative-ai NON ha un metodo diretto listModels().
        // Dobbiamo usare un trucco o un'altra libreria per farlo, oppure assumere un modello base.
        // Per ora, concentriamoci sull'usare un modello che SICURAMENTE funziona con v1beta.

        // TENTATIVO CON IL MODELLO PIÙ BASE SUPPORTATO DA v1beta
        const modelNameToTest = "gemini-pro"; // Ritorniamo a questo, è lo standard per v1beta
        const model = genAI.getGenerativeModel({ model: modelNameToTest });
        console.log(`[DIAGNOSI] Tentativo di usare il modello base: ${modelNameToTest}`);
        // Proviamo a fare una chiamata di test molto semplice
        const result = await model.generateContent("Ciao"); 
        console.log("[DIAGNOSI] Chiamata di test con gemini-pro RIUSCITA!");

    } catch (error) {
        console.error(`[DIAGNOSI] Errore durante il test del modello base: ${error.message}`);
        if (error.status === 404) {
             console.error("[DIAGNOSI] Il modello gemini-pro NON è trovato per questa chiave/progetto/versione API.");
        } else if (error.status === 400 && error.message.includes('API key not valid')) {
             console.error("[DIAGNOSI] ERRORE CHIAVE API: La chiave API non è valida o non ha i permessi corretti.");
        } else if (error.message.includes('Billing')) {
             console.error("[DIAGNOSI] ERRORE BILLING: Controlla che il billing sia abilitato per il progetto Google Cloud.");
        } else {
             console.error("[DIAGNOSI] Altro errore:", error);
        }
    }
}

// --- Creazione app Express e Middleware ---
const app = express();

// --- MIDDLEWARE PER GESTIRE IL SITO MOTIVAZIONALE ---
// Questo middleware intercetta le richieste *prima* del server statico
app.use(async (req, res, next) => {
    // Controlla se la richiesta arriva dal dominio motivazionale
    if (req.hostname === 'motivazional.taplinknfc.it' || req.hostname === 'www.motivazional.taplinknfc.it') {

        // Gestisce solo la rotta principale "/"
        if (req.path === '/') {
            const keychainId = req.query.id || 'Ospite';
            console.log(`[MOTIVAZIONAL] Scansione ricevuta da ID: ${keychainId}`);

            const quote = await getMotivationalQuote(keychainId);

            // Costruisce la pagina HTML (identica a quella dell'altro server)
            const htmlPage = `
                <!DOCTYPE html>
                <html lang="it">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>La tua Frase del Giorno</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin: 0; padding: 20px; box-sizing: border-box; }
                        .card { background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border-radius: 20px; padding: 40px; max-width: 600px; text-align: center; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
                        h1 { font-size: 20px; opacity: 0.8; margin: 0; }
                        p { font-size: 28px; font-weight: 600; line-height: 1.4; margin-top: 15px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Ciao, ${keychainId}</h1>
                        <p>"${quote}"</p>
                    </div>
                </body>
                </html>
            `;
            res.send(htmlPage);
        } else {
            // Se cercano un'altra pagina (es. /login) sul dominio motivazionale, dai 404
            res.status(404).send('Pagina non trovata.');
        }
    } else {
        // Se NON è il dominio motivazionale, procedi normalmente
        // (Express passerà la richiesta a app.use(express.static('.')) o alle rotte API)
        next();
    }
});

app.use(express.static('.'));

// --- Middleware di Autenticazione ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    next();
};

// --- MIDDLEWARE DI SICUREZZA PER I PERMESSI ---
const requireAnalytics = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.can_access_analytics && req.user.can_access_analytics == 1)) {
        next();
    } else {
        return res.status(403).json({ error: 'Accesso non autorizzato.' });
    }
};
const requireWallet = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.can_access_wallet && req.user.can_access_wallet == 1)) {
        next();
    } else {
        return res.status(403).json({ error: 'Accesso non autorizzato.' });
    }
};
const requirePos = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.can_access_pos && req.user.can_access_pos == 1)) {
        next();
    } else {
        return res.status(403).json({ error: 'Accesso non autorizzato.' });
    }
};

// --- ROUTE PUBBLICHE ---
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (!user) return res.status(400).json({ error: 'Credenziali non valide.' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Credenziali non valide.' });
        
        const payload = { 
            id: user.id, username: user.username, role: user.role, company_id: user.company_id,
            can_access_wallet: user.can_access_wallet,
            can_access_analytics: user.can_access_analytics,
            can_access_pos: user.can_access_pos
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
        
        res.json({ token, user: payload });
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
});

// --- ROUTE PER UTENTI 'USER' ---
app.get('/api/user/wallet', authenticateToken, requireWallet, (req, res) => {
    try {
        const userProfile = db.prepare(`SELECT id, username, email, balance_tap, loyalty_points FROM users WHERE id = ?`).get(req.user.id);
        if (!userProfile) return res.status(404).json({ error: 'Profilo utente non trovato.' });

        const transactions = db.prepare(`SELECT tap_change, type, description, timestamp FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20`).all(req.user.id);
        res.json({ profile: userProfile, transactions: transactions });
    } catch (error) {
        console.error('USER WALLET ERROR:', error);
        res.status(500).json({ error: 'Impossibile recuperare i dati del wallet.' });
    }
});

app.get('/api/user/links', authenticateToken, requireAnalytics, (req, res) => {
    if (!req.user.company_id) return res.status(403).json({ error: 'Utente non associato a un\'azienda.' });
    try {
        const links = db.prepare(`SELECT l.id, l.name, l.url, SUM(COALESCE(a.click_count, 0)) as total_clicks, COUNT(DISTINCT a.ip_address) as unique_visitors FROM links l LEFT JOIN analytics a ON l.id = a.link_id WHERE l.company_id = ? GROUP BY l.id, l.name, l.url ORDER BY total_clicks DESC`).all(req.user.company_id);
        res.json({ links });
    } catch(e) {
        console.error("Error fetching user links:", e);
        res.status(500).json({error: 'Impossibile recuperare i link.'});
    }
});


app.get('/api/user/analytics/:linkId', authenticateToken, requireAnalytics, (req, res) => {
    if (!req.user.company_id) return res.status(403).json({ error: 'Utente non associato a un\'azienda.' });
    
    try {
        const { linkId } = req.params;
        let { startDate, endDate, groupBy } = req.query;

        // Imposta valori di default se non forniti
        if (!startDate || !endDate) {
            const today = new Date();
            endDate = today.toISOString().split('T')[0];
            today.setDate(today.getDate() - 6);
            startDate = today.toISOString().split('T')[0];
        }
        if (!['day', 'week', 'month'].includes(groupBy)) {
            groupBy = 'day'; // Default a 'giorno'
        }

        const link = db.prepare('SELECT id FROM links WHERE id = ? AND company_id = ?').get(linkId, req.user.company_id);
        if (!link) return res.status(404).json({ error: 'Link non trovato o non autorizzato.' });

        // Le query per geo_distribution e recent_activity non cambiano
        const geo_dist = db.prepare(`SELECT country, SUM(click_count) as clicks FROM analytics WHERE link_id = ? AND country IS NOT NULL GROUP BY country ORDER BY clicks DESC LIMIT 5`).all(linkId);
        const recent_activity = db.prepare(`SELECT city, country, last_seen, os_name, browser_name, device_type FROM analytics WHERE link_id = ? AND date(last_seen) BETWEEN ? AND ? ORDER BY last_seen DESC LIMIT 10`).all(linkId, startDate, endDate);
        
        // ++ MODIFICA CHIAVE: Query dinamica per i click nel tempo ++
        let groupByFormat;
        switch (groupBy) {
            case 'week':
                groupByFormat = '%Y-%W'; // Formato Anno-NumeroSettimana (es. '2025-42')
                break;
            case 'month':
                groupByFormat = '%Y-%m'; // Formato Anno-Mese (es. '2025-10')
                break;
            default: // 'day'
                groupByFormat = '%Y-%m-%d';
                break;
        }

        const clicks_over_time_sql = `
            SELECT 
                strftime(?, last_seen) as time_group, 
                SUM(click_count) as clicks 
            FROM analytics 
            WHERE link_id = ? AND date(last_seen) BETWEEN ? AND ?
            GROUP BY time_group 
            ORDER BY time_group ASC
        `;
        const clicks_over_time = db.prepare(clicks_over_time_sql).all(groupByFormat, linkId, startDate, endDate);
        // La risposta ora conterrà 'time_group' invece di 'day'

        res.json({ geo_distribution: geo_dist, recent_activity: recent_activity, clicks_over_time: clicks_over_time });
    } catch(e) {
        console.error("ANALYTICS FETCH ERROR:", e);
        res.status(500).json({error: 'Impossibile recuperare gli analytics.'})
    }
});


app.get('/api/user/heatmap/:linkId', authenticateToken, requireAnalytics, (req, res) => {
    if (!req.user.company_id) return res.status(403).json({ error: 'Utente non associato a un\'azienda.' });

    try {
        const { linkId } = req.params;
        let { startDate, endDate } = req.query;

        // Stessa logica di default delle date
        if (!startDate || !endDate) {
            const today = new Date();
            endDate = today.toISOString().split('T')[0];
            today.setDate(today.getDate() - 6);
            startDate = today.toISOString().split('T')[0];
        }

        const link = db.prepare('SELECT id FROM links WHERE id = ? AND company_id = ?').get(linkId, req.user.company_id);
        if (!link) return res.status(404).json({ error: 'Link non trovato o non autorizzato.' });
        
        // Query che estrae giorno della settimana (0=Dom, 1=Lun...) e ora (00-23)
        // Prova questa se 'localtime' non dovesse funzionare
        const heatmapData = db.prepare(`
            SELECT 
                strftime('%w', last_seen, '+2 hours') as day_of_week, 
                strftime('%H', last_seen, '+2 hours') as hour_of_day,
                COUNT(id) as clicks
            FROM analytics 
            WHERE link_id = ? AND date(last_seen) BETWEEN ? AND ?
            GROUP BY day_of_week, hour_of_day
            `).all(linkId, startDate, endDate);
        
        res.json(heatmapData);
    } catch (e) {
        console.error("HEATMAP FETCH ERROR:", e);
        res.status(500).json({ error: 'Impossibile recuperare i dati per la heatmap.' });
    }
});

// --- AGGIUNTA ROTTA PAGAMENTI POS ---
app.post('/api/transactions/payment', authenticateToken, requirePos, (req, res) => {
    const { customer_id, amount, description } = req.body;
    const vendor_id = req.user.id;
    if (!customer_id || !amount || amount <= 0) return res.status(400).json({ error: 'ID cliente e importo (positivo) sono obbligatori.' });
    if (customer_id === vendor_id) return res.status(400).json({ error: 'Non puoi effettuare un pagamento a te stesso.' });

    try {
        const handlePayment = db.transaction(() => {
            const customer = db.prepare('SELECT balance_tap, username FROM users WHERE id = ?').get(customer_id);
            if (!customer) throw new Error('Cliente non trovato.');
            if (customer.balance_tap < amount) throw new Error('Fondi insufficienti.');
            
            const vendor = db.prepare('SELECT username FROM users WHERE id = ?').get(vendor_id);
            if (!vendor) throw new Error('Venditore non trovato.');

            db.prepare('UPDATE users SET balance_tap = balance_tap - ? WHERE id = ?').run(amount, customer_id);
            db.prepare('UPDATE users SET balance_tap = balance_tap + ? WHERE id = ?').run(amount, vendor_id);

            const descCustomer = description ? `Pagamento a ${vendor.username}: ${description}` : `Pagamento a ${vendor.username}`;
            db.prepare('INSERT INTO transactions (user_id, tap_change, type, description) VALUES (?, ?, ?, ?)').run(customer_id, -amount, 'PAYMENT_SENT', descCustomer);

            const descVendor = description ? `Pagamento da ${customer.username}: ${description}` : `Pagamento ricevuto da ${customer.username}`;
            db.prepare('INSERT INTO transactions (user_id, tap_change, type, description) VALUES (?, ?, ?, ?)').run(vendor_id, amount, 'PAYMENT_RECEIVED', descVendor);
            
            return { customerUsername: customer.username, vendorUsername: vendor.username };
        });

        const result = handlePayment();
        res.status(200).json({ message: `Pagamento di ${amount} TAP da ${result.customerUsername} a ${result.vendorUsername} completato.` });
    } catch (error) {
        console.error('PAYMENT ERROR:', error);
        if (error.message === 'Fondi insufficienti.' || error.message === 'Cliente non trovato.') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Errore interno del server durante il pagamento.' });
    }
});

// --- ROUTE ADMIN ---
app.post('/api/admin/adjust-balance', authenticateToken, requireAdmin, (req, res) => {
    const { user_id, operation, amount, description } = req.body;
    if (!user_id || !operation || !description) return res.status(400).json({ error: 'ID utente, operazione e descrizione sono obbligatori.' });
    if (['add', 'subtract'].includes(operation) && (!amount || amount <= 0)) return res.status(400).json({ error: 'Un importo valido è richiesto.' });
    if (!['add', 'subtract', 'set_zero'].includes(operation)) return res.status(400).json({ error: 'Operazione non valida.' });

    try {
        const balanceTransaction = db.transaction(() => {
            const user = db.prepare('SELECT balance_tap FROM users WHERE id = ?').get(user_id);
            if (!user) throw new Error('Utente non trovato.');

            let newBalance, tapChange, transactionType;
            switch (operation) {
                case 'add':
                    newBalance = user.balance_tap + amount;
                    tapChange = amount;
                    transactionType = 'ADJUST_ADD_ADMIN';
                    break;
                case 'subtract':
                    if (user.balance_tap < amount) throw new Error(`Fondi insufficienti. L'utente ha solo ${user.balance_tap} TAP.`);
                    newBalance = user.balance_tap - amount;
                    tapChange = -amount;
                    transactionType = 'ADJUST_SUB_ADMIN';
                    break;
                case 'set_zero':
                    newBalance = 0;
                    tapChange = -user.balance_tap;
                    transactionType = 'ADJUST_ZERO_ADMIN';
                    break;
            }
            db.prepare('UPDATE users SET balance_tap = ? WHERE id = ?').run(newBalance, user_id);
            db.prepare('INSERT INTO transactions (user_id, tap_change, type, description) VALUES (?, ?, ?, ?)').run(user_id, tapChange, transactionType, description);
        });
        balanceTransaction();
        res.status(200).json({ message: 'Operazione sul saldo completata con successo.' });
    } catch (error) {
        console.error('ADJUST BALANCE ERROR:', error);
        res.status(400).json({ error: error.message || 'Errore durante l\'operazione sul saldo.' });
    }
});

app.get('/api/admin/companies', authenticateToken, requireAdmin, (req, res) => {
    try {
        const companies = db.prepare('SELECT id, name FROM companies ORDER BY name ASC').all();
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
});

app.post('/api/admin/companies', authenticateToken, requireAdmin, (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Il nome dell\'azienda è obbligatorio' });
    try {
        const result = db.prepare('INSERT INTO companies (name, description) VALUES (?, ?)').run(name, description);
        res.status(201).json({ id: result.lastInsertRowid, name, description });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Un\'azienda con questo nome esiste già' });
        res.status(500).json({ error: 'Errore durante la creazione dell\'azienda' });
    }
});

app.post('/api/admin/links', authenticateToken, requireAdmin, (req, res) => {
    const { name, url, description, company_id } = req.body;
    if (!name || !url || !company_id) return res.status(400).json({ error: 'Nome, URL e ID Azienda sono obbligatori.' });
    try {
        const result = db.prepare(`INSERT INTO links (name, url, description, company_id, created_by) VALUES (?, ?, ?, ?, ?)`).run(name, url, description, company_id, req.user.id);
        res.status(201).json({ id: result.lastInsertRowid, message: 'Link creato con successo.' });
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
});

app.get('/api/admin/links', authenticateToken, requireAdmin, (req, res) => {
    try {
        const links = db.prepare(`SELECT l.id, l.name, l.url, l.description, c.name as company_name FROM links l LEFT JOIN companies c ON l.company_id = c.id ORDER BY l.id DESC`).all();
        res.json(links);
    } catch (error) {
        console.error('GET ALL LINKS ERROR:', error);
        res.status(500).json({ error: 'Errore nel recuperare i link.' });
    }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = db.prepare(`SELECT u.id, u.username, u.email, u.role, u.balance_tap, c.name as company_name, u.can_access_wallet, u.can_access_analytics, u.can_access_pos FROM users u LEFT JOIN companies c ON u.company_id = c.id ORDER BY u.id DESC`).all();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Errore nel recuperare gli utenti.' });
    }
});

// --- CORREZIONE: RIMOSSA LA ROTTA DUPLICATA ---
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    const { username, email, password, company_id, role, can_access_wallet, can_access_analytics, can_access_pos } = req.body;
    if (!username || !email || !password || !role) return res.status(400).json({ error: 'Username, email, password e ruolo sono obbligatori.' });
    if (can_access_analytics && !company_id) return res.status(400).json({ error: 'Un utente con accesso Analytics deve essere associato a un\'azienda.' });
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (username, email, password, company_id, role, can_access_wallet, can_access_analytics, can_access_pos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const result = db.prepare(sql).run(username, email, hashedPassword, company_id, role, can_access_wallet ? 1 : 0, can_access_analytics ? 1 : 0, can_access_pos ? 1 : 0);
        res.status(201).json({ id: result.lastInsertRowid, message: 'Utente creato con successo.' });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Username o email già esistenti.' });
        res.status(500).json({ error: 'Errore nella creazione dell\'utente.' });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
    const userIdToDelete = parseInt(req.params.id, 10);
    if (userIdToDelete === 1) return res.status(403).json({ error: 'Non è possibile eliminare l\'amministratore principale.' });
    if (userIdToDelete === req.user.id) return res.status(403).json({ error: 'Non puoi eliminare te stesso.' });
    try {
        const result = db.prepare(`DELETE FROM users WHERE id = ?`).run(userIdToDelete);
        if (result.changes === 0) return res.status(404).json({ error: 'Utente non trovato.' });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'utente.' });
    }
});

// Le rotte /report/... non sono usate al momento, ma le lasciamo
app.get('/api/admin/analytics/report/summary/:linkId', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { linkId } = req.params;
        const stmt = db.prepare(`SELECT country, city, SUM(click_count) as total_clicks FROM analytics WHERE link_id = ? GROUP BY country, city ORDER BY total_clicks DESC`);
        const report = stmt.all(linkId);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
});
app.get('/api/admin/analytics/report/detail/:linkId', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { linkId } = req.params;
        const stmt = db.prepare(`SELECT ip_address, country, city, user_agent, click_count, first_seen, last_seen FROM analytics WHERE link_id = ? ORDER BY last_seen DESC`);
        const report = stmt.all(linkId);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
});

// --- ROTTE DI REDIRECT ---
// Sostituisci la tua funzione recordClick con questa versione aggiornata

function recordClick(linkId, keychainId, req) {
    // Nota: 'x-forwarded-for' è importante se usi un proxy come Nginx
    const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    const geo = geoip.lookup(ip) || {};
    const userAgent = req.get('User-Agent');

    // Estrai le coordinate, con un fallback a null se non trovate
    const lat = (geo.ll && geo.ll[0]) ? geo.ll[0] : null;
    const lon = (geo.ll && geo.ll[1]) ? geo.ll[1] : null;

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const osName = result.os.name;
    const browserName = result.browser.name;
    const deviceType = result.device.type || 'Sconosciuto';

    const stmt = db.prepare(`
        INSERT INTO analytics (
            link_id, keychain_id, ip_address, user_agent, referrer, country, city, lat, lon,
            os_name, browser_name, device_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
        ON CONFLICT(link_id, ip_address, keychain_id) DO UPDATE SET 
            click_count = click_count + 1, 
            last_seen = CURRENT_TIMESTAMP,
            user_agent = excluded.user_agent,
            os_name = excluded.os_name,
            browser_name = excluded.browser_name,
            device_type = excluded.device_type
    `);

    stmt.run(
        linkId, keychainId, ip, userAgent, req.get('Referrer'), 
        geo.country, geo.city, lat, lon, // Aggiunti lat e lon
        osName, browserName, deviceType
    );
}

app.get('/api/user/geostats/:linkId', authenticateToken, requireAnalytics, (req, res) => {
    if (!req.user.company_id) {
        return res.status(403).json({ error: 'Utente non associato a un\'azienda.' });
    }
    
    try {
        const { linkId } = req.params;
        
        // Verifica che l'utente possa accedere a questo link
        const link = db.prepare('SELECT id FROM links WHERE id = ? AND company_id = ?').get(linkId, req.user.company_id);
        if (!link) {
            return res.status(404).json({ error: 'Link non trovato o non autorizzato.' });
        }

        // Query per raggruppare i click per città, contando i click totali
        const sql = `
            SELECT 
                city, 
                country,
                lat,
                lon,
                SUM(click_count) as total_clicks
            FROM 
                analytics 
            WHERE 
                link_id = ? AND city IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
            GROUP BY 
                city, country, lat, lon
            ORDER BY 
                total_clicks DESC
        `;

        const geoData = db.prepare(sql).all(linkId);
        res.json(geoData);

    } catch (e) {
        console.error("Error fetching geo stats:", e);
        res.status(500).json({ error: 'Impossibile recuperare le statistiche geografiche.' });
    }
});

app.get('/r/:linkId', (req, res) => {
    try {
        const link = db.prepare(`SELECT url, id FROM links WHERE id = ?`).get(req.params.linkId);
        if (!link) return res.status(404).send('Link non trovato.');
        recordClick(link.id, null, req);
        res.redirect(link.url);
    } catch (error) {
        res.status(500).send('Errore del server.');
    }
});

app.get('/k/:keychainId', (req, res) => {
    try {
        const keychain = db.prepare(`SELECT link_id FROM keychains WHERE id = ?`).get(req.params.keychainId);
        if (!keychain) return res.status(404).send('Keychain non trovato.');
        const link = db.prepare(`SELECT url FROM links WHERE id = ?`).get(keychain.link_id);
        if (!link) return res.status(404).send('Link associato non trovato.');
        recordClick(keychain.link_id, req.params.keychainId, req);
        res.redirect(link.url);
    } catch (error) {
        res.status(500).send('Errore del server.');
    }
});

app.get('/api/geocode', authenticateToken, async (req, res) => {
    const { q } = req.query; // q sarà la città, es: "Cuneo, IT"

    if (!q) {
        return res.status(400).json({ error: 'Query di ricerca mancante' });
    }

    const apiKey = process.env.OPENCAGE_API_KEY;
    if (!apiKey) {
        console.error("ERRORE: OPENCAGE_API_KEY non trovata nel file .env");
        return res.status(500).json({ error: 'API key per il geocoding non configurata.' });
    }

    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(q)}&key=${apiKey}&limit=1`;

    try {
        const geoResponse = await fetch(url);
        const data = await geoResponse.json();

        if (data.results && data.results.length > 0) {
            // Invia al browser solo le coordinate {lat, lng}
            res.json(data.results[0].geometry);
        } else {
            res.status(404).json({ lat: null, lng: null }); // Rispondi con null se non trova
        }
    } catch (error) {
        console.error('Errore Geocoding Proxy:', error);
        res.status(500).json({ error: 'Errore durante la chiamata al servizio di geocoding.' });
    }
});

// --- AVVIO DEL SERVER ---
app.listen(PORT, () => {
    console.log(`Server is stable and running on port ${PORT}`);
});
