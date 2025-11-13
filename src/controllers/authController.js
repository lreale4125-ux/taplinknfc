const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// --- GOOGLE OAUTH - AVVIO FLUSSO ---
async function googleAuth(req, res) {
    try {
        // 🎯 Costruisci l'URL di autorizzazione Google
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const redirectUri = 'https://taplinknfc.it/api/auth/google/callback';
        const scope = 'email profile';
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${clientId}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(scope)}` +
            `&access_type=offline` +
            `&prompt=consent`;
        
        // 🎯 Reindirizza l'utente a Google per l'autorizzazione
        console.log('Reindirizzamento a Google OAuth:', authUrl);
        res.redirect(authUrl);
        
    } catch (error) {
        console.error('Errore durante redirect a Google:', error);
        res.status(500).json({ error: 'Errore durante il login con Google' });
    }
}

// --- GOOGLE OAUTH CALLBACK ---
async function googleAuthCallback(req, res) {
    try {
        const { code } = req.query;
        
        if (!code) {
            console.error('Codice di autorizzazione mancante');
            return res.redirect('https://taplinknfc.it/login?error=google_auth_failed');
        }

        console.log('Google Auth Code ricevuto:', code);
        
        // 🎯 PER ORA - REINDIRIZZA ALLA PAGINA MOTIVAZIONALE
        // In futuro qui scambierai il code con un access token
        const tempToken = jwt.sign(
            { id: 'temp_google_user', username: 'Google User', role: 'motivazional' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        const redirectUrl = `https://motivazional.taplinknfc.it?token=${tempToken}&id=google_temp&topic=motivazione&message=Google+login+in+sviluppo`;
        res.redirect(redirectUrl);
        
    } catch (error) {
        console.error('Errore durante callback Google:', error);
        res.redirect('https://taplinknfc.it/login?error=google_callback_error');
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
    googleAuth,
    googleAuthCallback
};
