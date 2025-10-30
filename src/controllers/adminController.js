const bcrypt = require('bcryptjs');
const db = require('../db');
// Assicurati che il percorso a qrGenerator sia corretto
const { generateAndSaveQR } = require('../utils/qrGenerator'); 

// ===================================================================
// NUOVA FUNZIONE: CREA E ASSOCIA KEYCHAIN QR
// ===================================================================
/**
 * Crea un'associazione nella tabella 'keychains' e genera i file QR.
 * Il QR punterà a /k/{keychain_id}, che poi reindirizzerà al link_id.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function createKeychainQr(req, res) {
    // keychain_id è l'ID univoco testuale (es. '001'), non l'ID autoincrementante
    const { link_id, keychain_id, user_id } = req.body;

    if (!link_id || !keychain_id || !user_id) {
        return res.status(400).json({ error: 'link_id, keychain_id (ID univoco), e user_id sono obbligatori.' });
    }

    try {
        // 1. Inserisci nel database (Associazione)
        // Usiamo keychain_number per salvare l'ID univoco testuale
        const stmt = db.prepare(`
            INSERT INTO keychains (user_id, link_id, keychain_number, data) 
            VALUES (?, ?, ?, ?)
        `);
        const result = stmt.run(user_id, link_id, keychain_id, JSON.stringify({ created_by: 'admin' }));

        if (result.changes === 0) {
            throw new Error('Inserimento nel database fallito.');
        }

        // 2. Genera i file QR (fisici)
        // Questa funzione deve generare un QR che codifica l'URL /k/{keychain_id}
        await generateAndSaveQR(keychain_id);

        res.status(201).json({ 
            message: `QR Code '${keychain_id}' creato e associato al Link ID ${link_id}.`,
            keychain_db_id: result.lastInsertRowid
        });

    } catch (error) {
        console.error("Errore durante la creazione del Keychain QR:", error);
        // Gestisce l'errore se l'ID univoco (keychain_number) esiste già
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE constraint failed: keychains.keychain_number')) {
             return res.status(400).json({ error: 'Questo ID Univoco (keychain_id) è già stato utilizzato.' });
        }
        res.status(500).json({ error: error.message || 'Errore interno del server.' });
    }
}


// ===================================================================
// FUNZIONI PER I SELETTORI (NUOVE)
// ===================================================================

/**
 * Crea un nuovo Selettore (Redirect Centralizzato).
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function createSelector(req, res) {
    const { name, redirect_url, description } = req.body;
    if (!name || !redirect_url) return res.status(400).json({ error: 'Nome e URL di reindirizzamento sono obbligatori.' });

    try {
        const result = db.prepare(
            `INSERT INTO selectors (name, redirect_url, description, created_by) VALUES (?, ?, ?, ?)`
        ).run(name, redirect_url, description, req.user.id);
        
        res.status(201).json({ 
            id: result.lastInsertRowid, 
            message: 'Selettore creato con successo.' 
        });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Un selettore con questo nome esiste già.' });
        console.error('CREATE SELECTOR ERROR:', error);
        res.status(500).json({ error: 'Errore durante la creazione del selettore.' });
    }
}

/**
 * Recupera tutti i Selettori.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getSelectors(req, res) {
    try {
        const selectors = db.prepare('SELECT id, name, redirect_url, description, created_at FROM selectors ORDER BY name ASC').all();
        res.json(selectors);
    } catch (error) {
        console.error('GET SELECTORS ERROR:', error);
        res.status(500).json({ error: 'Errore nel recuperare i selettori.' });
    }
}

/**
 * Aggiorna un Selettore (il suo URL è la parte cruciale).
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function updateSelector(req, res) {
    const selectorId = req.params.id;
    const { name, redirect_url, description } = req.body;
    if (!name || !redirect_url) return res.status(400).json({ error: 'Nome e URL di reindirizzamento sono obbligatori.' });

    try {
        const result = db.prepare(
            `UPDATE selectors SET name = ?, redirect_url = ?, description = ? WHERE id = ?`
        ).run(name, redirect_url, description || null, selectorId);

        if (result.changes === 0) return res.status(404).json({ error: 'Selettore non trovato o dati identici.' });
        
        res.status(200).json({ message: 'Selettore aggiornato con successo.' });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Un selettore con questo nome esiste già.' });
        console.error('UPDATE SELECTOR ERROR:', error);
        res.status(500).json({ error: 'Errore durante l\'aggiornamento del selettore.' });
    }
}

/**
 * Elimina un Selettore.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function deleteSelector(req, res) {
    const selectorId = req.params.id;

    try {
        // La chiave esterna in 'links' è ON DELETE SET NULL, quindi l'eliminazione è sicura.
        const result = db.prepare(`DELETE FROM selectors WHERE id = ?`).run(selectorId);
        if (result.changes === 0) return res.status(404).json({ error: 'Selettore non trovato.' });
        res.status(204).send();
    } catch (error) {
        console.error('DELETE SELECTOR ERROR:', error);
        res.status(500).json({ error: 'Errore durante l\'eliminazione del selettore.' });
    }
}

// ===================================================================
// FUNZIONI PER I LINK (MODIFICATE/NUOVE)
// ===================================================================

/**
 * Create a new link (MODIFICATA)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function createLink(req, res) {
    const { name, url, description, company_id, selector_id } = req.body; 

    // Validazione: Nome e Azienda obbligatori
    if (!name || !company_id) return res.status(400).json({ error: 'Nome e ID Azienda sono obbligatori.' });
    // Validazione: O URL o Selettore, non entrambi
    if (!url && !selector_id) return res.status(400).json({ error: 'Specificare un URL o un ID Selettore.' });
    if (url && selector_id) return res.status(400).json({ error: 'Specificare solo URL O ID Selettore, non entrambi.' });

    try {
        const sql = `INSERT INTO links (name, url, description, company_id, created_by, selector_id) VALUES (?, ?, ?, ?, ?, ?)`;
        const result = db.prepare(sql).run(name, url || null, description, company_id, req.user.id, selector_id || null);
        
        res.status(201).json({ id: result.lastInsertRowid, message: 'Link creato con successo.' });
    } catch (error) {
        console.error('CREATE LINK ERROR:', error);
        res.status(500).json({ error: 'Errore del server durante la creazione del link.' });
    }
}

/**
 * Get all links (Funzione originale)
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
 * Get links for the Admin Management Table (NUOVA FUNZIONE PER LA DASHBOARD)
 * Include stato QR, nome azienda e nome selettore.
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getLinksWithQr(req, res) {
    try {
        // Query aggiornata per prendere il keychain_number (l'ID univoco del QR)
        const links = db.prepare(`
            SELECT 
                l.id, l.name, l.url, l.description, l.selector_id,
                c.name as company_name, 
                s.name as selector_name,
                s.redirect_url as selector_redirect_url,
                (CASE WHEN k.link_id IS NOT NULL THEN 1 ELSE 0 END) as has_qr_code,
                k.keychain_number AS keychain_id 
            FROM links l 
            LEFT JOIN companies c ON l.company_id = c.id 
            LEFT JOIN selectors s ON l.selector_id = s.id
            LEFT JOIN keychains k ON l.id = k.link_id 
            GROUP BY l.id
            ORDER BY l.id DESC
        `).all();
        
        // Mappa i risultati per il frontend
        const formattedLinks = links.map(link => {
            return {
                id: link.id,
                name: link.name,
                url: link.url, // URL diretto (usato per popolare il form QR)
                // Destinazione visualizzata in tabella
                effective_url: link.selector_id 
                    ? `Selettore: ${link.selector_name} (-> ${link.selector_redirect_url})` 
                    : link.url,
                company_name: link.company_name,
                selector_id: link.selector_id,
                selector_name: link.selector_name,
                has_qr_code: link.has_qr_code,
                keychain_id: link.keychain_id || null // ID univoco del QR
            };
        });
        
        res.json(formattedLinks);
    } catch (error) {
        console.error('GET LINKS WITH QR ERROR:', error);
        res.status(500).json({ error: 'Errore nel recuperare i link per la gestione.' });
    }
}


// ===================================================================
// FUNZIONI ORIGINALI (NON MODIFICATE)
// ===================================================================

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

/**
 * Genera e salva un QR Code per l'ID univoco specificato (VECCHIA FUNZIONE)
 * Questa è usata per i "QR Motivazionali"
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function generateQrCode(req, res) {
    const { keychainId } = req.params;

    if (!keychainId) {
        return res.status(400).json({ error: 'ID univoco (keychainId) mancante.' });
    }

    try {
        await generateAndSaveQR(keychainId);
        res.status(200).json({ message: `QR Code per ID ${keychainId} generato e salvato con successo.` });
    } catch (error) {
        console.error("Errore durante la generazione del QR Code:", error);
        res.status(500).json({ error: 'Errore interno del server durante la generazione del QR Code.' });
    }
}


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

// ===================================================================
// ESPORTAZIONI (AGGIORNATE)
// ===================================================================
module.exports = {
    adjustBalance,
    generateQrCode,     // Vecchia funzione (per QR motivazionali)
    createKeychainQr,   // Nuova funzione (per associare Link a QR)
    getCompanies,
    createCompany,
    // Selettori
    createSelector,
    getSelectors,
    updateSelector,
    deleteSelector,
    // Links
    createLink,
    getLinks,           // Vecchia funzione
    getLinksWithQr,     // Nuova funzione per la dashboard
    // Utenti
    getUsers,
    createUser,
    deleteUser,
    // Analytics
    getAnalyticsSummary,
    getAnalyticsDetail
};
