const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// --- LOGIN ---
// Gestisce login per tutti gli utenti (wallet, analytics, POS ecc.)
async function login(req, res) {
    const { email, password } = req.body;
    try {
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (!user) return res.status(400).json({ error: 'Credenziali non valide.' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Credenziali non valide.' });

        const payload = {
            id: user.id,
            username: user.username,
            role: user.role,
            company_id: user.company_id,
            can_access_wallet: user.can_access_wallet,
            can_access_analytics: user.can_access_analytics,
            can_access_pos: user.can_access_pos
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({ token, user: payload });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Errore del server.' });
    }
}

// --- REGISTER ---
// Gestisce registrazioni "motivazionali": vengono create solo come utenti normali
// e reindirizzati automaticamente alla pagina motivazionale con token.
async function register(req, res) {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
        return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
    }

    try {
        // Controlla se l'utente esiste già
        const existingUser = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (existingUser) return res.status(400).json({ error: 'Email già registrata.' });

        // Hash della password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Inserisce nuovo utente come normale (senza ruoli speciali)
        const stmt = db.prepare(`
            INSERT INTO users (email, password, username, role, can_access_wallet, can_access_analytics, can_access_pos)
            VALUES (?, ?, ?, 'user', 0, 0, 0)
        `);
        const info = stmt.run(email, hashedPassword, username);

        // Prepara payload JWT
        const payload = {
            id: info.lastInsertRowid,
            username,
            role: 'user',
            can_access_wallet: 0,
            can_access_analytics: 0,
            can_access_pos: 0
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        // Redirect automatico alla pagina motivazionale
        res.redirect(`https://motivazional.taplinknfc.it?id=${payload.id}&token=${token}&topic=motivazione`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Errore del server.' });
    }
}

module.exports = {
    login,
    register
};
