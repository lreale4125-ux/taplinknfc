const bcrypt = require('bcryptjs');
const db = require('../db');

/**
 * Adjust user balance
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function adjustBalance(req, res) {
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
}
// ===================================================================
// NUOVA FUNZIONE: Generazione QR Code
// ===================================================================
/**
 * Genera e salva un QR Code per l'ID univoco specificato.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function generateQrCode(req, res) {
    const { keychainId } = req.params;

    if (!keychainId) {
        return res.status(400).json({ error: 'ID univoco (keychainId) mancante.' });
    }

    try {
        await generateQrCodeAndSave(keychainId);
        res.status(200).json({ message: `QR Code per ID ${keychainId} generato e salvato con successo.` });
    } catch (error) {
        console.error("Errore durante la generazione del QR Code:", error);
        res.status(500).json({ error: 'Errore interno del server durante la generazione del QR Code.' });
    }
}
// ===================================================================


/**
 * Get all companies
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getCompanies(req, res) {
    try {
        const companies = db.prepare('SELECT id, name FROM companies ORDER BY name ASC').all();
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
}

/**
 * Create a new company
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function createCompany(req, res) {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Il nome dell\'azienda è obbligatorio' });
    try {
        const result = db.prepare('INSERT INTO companies (name, description) VALUES (?, ?)').run(name, description);
        res.status(201).json({ id: result.lastInsertRowid, name, description });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Un\'azienda con questo nome esiste già' });
        res.status(500).json({ error: 'Errore durante la creazione dell\'azienda' });
    }
}

/**
 * Create a new link
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function createLink(req, res) {
    const { name, url, description, company_id } = req.body;
    if (!name || !url || !company_id) return res.status(400).json({ error: 'Nome, URL e ID Azienda sono obbligatori.' });
    try {
        const result = db.prepare(`INSERT INTO links (name, url, description, company_id, created_by) VALUES (?, ?, ?, ?, ?)`).run(name, url, description, company_id, req.user.id);
        res.status(201).json({ id: result.lastInsertRowid, message: 'Link creato con successo.' });
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
}

/**
 * Get all links
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getLinks(req, res) {
    try {
        const links = db.prepare(`SELECT l.id, l.name, l.url, l.description, c.name as company_name FROM links l LEFT JOIN companies c ON l.company_id = c.id ORDER BY l.id DESC`).all();
        res.json(links);
    } catch (error) {
        console.error('GET ALL LINKS ERROR:', error);
        res.status(500).json({ error: 'Errore nel recuperare i link.' });
    }
}

/**
 * Get all users
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getUsers(req, res) {
    try {
        const users = db.prepare(`SELECT u.id, u.username, u.email, u.role, u.balance_tap, c.name as company_name, u.can_access_wallet, u.can_access_analytics, u.can_access_pos FROM users u LEFT JOIN companies c ON u.company_id = c.id ORDER BY u.id DESC`).all();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Errore nel recuperare gli utenti.' });
    }
}

/**
 * Create a new user
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function createUser(req, res) {
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
}

/**
 * Delete a user
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function deleteUser(req, res) {
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
}

/**
 * Get summary analytics report
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getAnalyticsSummary(req, res) {
    try {
        const { linkId } = req.params;
        const stmt = db.prepare(`SELECT country, city, SUM(click_count) as total_clicks FROM analytics WHERE link_id = ? GROUP BY country, city ORDER BY total_clicks DESC`);
        const report = stmt.all(linkId);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
}

/**
 * Get detailed analytics report
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getAnalyticsDetail(req, res) {
    try {
        const { linkId } = req.params;
        const stmt = db.prepare(`SELECT ip_address, country, city, user_agent, click_count, first_seen, last_seen FROM analytics WHERE link_id = ? ORDER BY last_seen DESC`);
        const report = stmt.all(linkId);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Errore del server.' });
    }
}

module.exports = {
    adjustBalance,
    generateQrCode,
    getCompanies,
    createCompany,
    createLink,
    getLinks,
    getUsers,
    createUser,
    deleteUser,
    getAnalyticsSummary,
    getAnalyticsDetail
};
