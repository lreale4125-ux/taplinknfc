const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// --- LOGIN ---
// Gestisce login per tutti gli utenti (wallet, analytics, POS, motivazional)
async function login(req, res) {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e password sono obbligatori.' });
    }

    try {
        // Recupera utente dal DB
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (!user) {
            return res.status(400).json({ error: 'Credenziali non valide.' });
        }

        // 🎯 CORREZIONE CRITICA: Verifica password corretta
        // Usa 'password_hash' se esiste nel DB, altrimenti 'password'
        const passwordField = user.password_hash || user.password;
        const validPassword = await bcrypt.compare(password, passwordField);
        
        if (!validPassword) {
            return res.status(400).json({ error: 'Credenziali non valide.' });
        }

        // Prepara payload JWT
        const payload = {
            id: user.id,
            username: user.username,
            role: user.role,
            company_id: user.company_id,
            can_access_wallet: user.can_access_wallet || 0,
            can_access_analytics: user.can_access_analytics || 0,
            can_access_pos: user.can_access_pos || 0
        };

        // Crea token JWT
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        // 🎯 GESTIONE REDIRECT PER UTENTI MOTIVAZIONAL
        if (user.role === 'motivazional') {
            const redirectUrl = `https://motivazional.taplinknfc.it?token=${token}&id=${payload.id}&topic=motivazione`;
            
            return res.json({ 
                success: true,
                token: token, 
                user: payload, 
                redirect: redirectUrl 
            });
        }

        // Per tutti gli altri utenti (admin, analytics, POS, wallet)
        res.json({ 
            success: true,
            token: token, 
            user: payload 
        });

    } catch (error) {
        console.error('Errore durante il login:', error);
        res.status(500).json({ error: 'Errore del server durante il login.' });
    }
}

// --- REGISTER ---
// Nuovi utenti registrati qui vengono automaticamente assegnati al ruolo 'motivazional'
async function register(req, res) {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
        return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
    }

    // Validazione email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Formato email non valido.' });
    }

    // Validazione password
    if (password.length < 6) {
        return res.status(400).json({ error: 'La password deve essere di almeno 6 caratteri.' });
    }

    try {
        // Controlla se l'utente esiste già
        const existingUser = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email già registrata.' });
        }

        // Controlla se lo username è già utilizzato
        const existingUsername = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
        if (existingUsername) {
            return res.status(400).json({ error: 'Username già utilizzato.' });
        }

        // Hash della password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 🎯 INSERISCE NUOVO UTENTE CON RUOLO 'motivazional'
        const stmt = db.prepare(`
            INSERT INTO users (email, password, username, role, can_access_wallet, can_access_analytics, can_access_pos, created_at)
            VALUES (?, ?, ?, 'motivazional', 0, 0, 0, datetime('now'))
        `);
        
        const info = stmt.run(email, hashedPassword, username);

        // Prepara payload JWT
        const payload = {
            id: info.lastInsertRowid,
            username: username,
            role: 'motivazional',
            company_id: null,
            can_access_wallet: 0,
            can_access_analytics: 0,
            can_access_pos: 0
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        // 🎯 REDIRECT AUTOMATICO PER UTENTI MOTIVAZIONAL
        const redirectUrl = `https://motivazional.taplinknfc.it?token=${token}&id=${payload.id}&topic=motivazione`;
        
        return res.json({ 
            success: true,
            message: 'Registrazione completata con successo!',
            token: token, 
            user: payload, 
            redirect: redirectUrl 
        });

    } catch (error) {
        console.error('Errore durante la registrazione:', error);
        
        if (error.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Email o username già registrati.' });
        }
        
        res.status(500).json({ error: 'Errore del server durante la registrazione.' });
    }
}

// --- FUNZIONE AGGIUNTIVA: Verifica Token (opzionale) ---
async function verifyToken(req, res) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'Token non fornito.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ 
            valid: true, 
            user: decoded 
        });
    } catch (error) {
        res.status(401).json({ 
            valid: false, 
            error: 'Token non valido o scaduto.' 
        });
    }
}

module.exports = {
    login,
    register,
    verifyToken
};
