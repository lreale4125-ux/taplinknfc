const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// --- GOOGLE OAUTH ---
async function googleAuth(req, res) {
    // Questa funzione verrà chiamata dopo che Google ha autenticato l'utente
    const { token: googleToken, email, name, googleId } = req.body;

    if (!email || !googleId) {
        return res.status(400).json({ error: 'Dati Google incompleti.' });
    }

    try {
        // Cerca utente per email o google_id
        let user = db.prepare("SELECT * FROM users WHERE email = ? OR google_id = ?").get(email, googleId);
        
        if (!user) {
            // Crea nuovo utente con Google
            const stmt = db.prepare(`
                INSERT INTO users (email, username, role, google_id, created_at)
                VALUES (?, ?, 'motivazional', ?, datetime('now'))
            `);
            const info = stmt.run(email, name || email.split('@')[0], googleId);
            
            user = {
                id: info.lastInsertRowid,
                email: email,
                username: name || email.split('@')[0],
                role: 'motivazional',
                google_id: googleId
            };
        } else if (!user.google_id) {
            // Aggiorna utente esistente con Google ID
            db.prepare("UPDATE users SET google_id = ? WHERE id = ?").run(googleId, user.id);
            user.google_id = googleId;
        }

        // Prepara payload JWT
        const payload = {
            id: user.id,
            username: user.username,
            role: user.role,
            email: user.email
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        // Redirect a motivational
        const redirectUrl = `https://motivazional.taplinknfc.it?token=${token}&id=${user.id}&topic=motivazione`;
        
        return res.json({ 
            success: true,
            message: 'Login con Google completato!',
            token: token, 
            user: payload, 
            redirect: redirectUrl 
        });

    } catch (error) {
        console.error('Errore durante login Google:', error);
        res.status(500).json({ error: 'Errore del server durante il login Google.' });
    }
}

// --- LOGIN TRADIZIONALE ---
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

        // Verifica password
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

        // Redirect per utenti motivazionali
        if (user.role === 'motivazional') {
            const redirectUrl = `https://motivazional.taplinknfc.it?token=${token}&id=${payload.id}&topic=motivazione`;
            
            return res.json({ 
                success: true,
                token: token, 
                user: payload, 
                redirect: redirectUrl 
            });
        }

        // Per tutti gli altri utenti
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

// --- REGISTER TRADIZIONALE ---
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

        // Inserisce nuovo utente
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

        // Redirect a motivational
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

// --- VERIFY TOKEN ---
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
    verifyToken,
    googleAuth
};
