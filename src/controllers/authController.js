const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database');

/**
 * Handles user login
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function login(req, res) {
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
}

module.exports = {
    login
};