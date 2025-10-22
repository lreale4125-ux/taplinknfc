const db = require('../db');
const { recordClick } = require('../utils/analytics');

/**
 * Get user wallet information
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getWallet(req, res) {
    try {
        const userProfile = db.prepare(`SELECT id, username, email, balance_tap, loyalty_points FROM users WHERE id = ?`).get(req.user.id);
        if (!userProfile) return res.status(404).json({ error: 'Profilo utente non trovato.' });

        const transactions = db.prepare(`SELECT tap_change, type, description, timestamp FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20`).all(req.user.id);
        res.json({ profile: userProfile, transactions: transactions });
    } catch (error) {
        console.error('USER WALLET ERROR:', error);
        res.status(500).json({ error: 'Impossibile recuperare i dati del wallet.' });
    }
}

/**
 * Get user links with analytics
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getLinks(req, res) {
    if (!req.user.company_id) return res.status(403).json({ error: 'Utente non associato a un\'azienda.' });
    try {
        const links = db.prepare(`SELECT l.id, l.name, l.url, SUM(COALESCE(a.click_count, 0)) as total_clicks, COUNT(DISTINCT a.ip_address) as unique_visitors FROM links l LEFT JOIN analytics a ON l.id = a.link_id WHERE l.company_id = ? GROUP BY l.id, l.name, l.url ORDER BY total_clicks DESC`).all(req.user.company_id);
        res.json({ links });
    } catch(e) {
        console.error("Error fetching user links:", e);
        res.status(500).json({error: 'Impossibile recuperare i link.'});
    }
}

/**
 * Get analytics for a specific link
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getAnalytics(req, res) {
    if (!req.user.company_id) return res.status(403).json({ error: 'Utente non associato a un\'azienda.' });

    try {
        const { linkId } = req.params;
        let { startDate, endDate, groupBy } = req.query;

        if (!startDate || !endDate) {
            const today = new Date();
            endDate = today.toISOString().split('T')[0];
            today.setDate(today.getDate() - 6);
            startDate = today.toISOString().split('T')[0];
        }
        if (!['day', 'week', 'month'].includes(groupBy)) {
            groupBy = 'day';
        }

        const link = db.prepare('SELECT id FROM links WHERE id = ? AND company_id = ?').get(linkId, req.user.company_id);
        if (!link) return res.status(404).json({ error: 'Link non trovato o non autorizzato.' });

        const geo_dist = db.prepare(`SELECT country, SUM(click_count) as clicks FROM analytics WHERE link_id = ? AND country IS NOT NULL GROUP BY country ORDER BY clicks DESC LIMIT 5`).all(linkId);
        const recent_activity = db.prepare(`SELECT city, country, last_seen, os_name, browser_name, device_type FROM analytics WHERE link_id = ? AND date(last_seen) BETWEEN ? AND ? ORDER BY last_seen DESC LIMIT 10`).all(linkId, startDate, endDate);

        let groupByFormat;
        switch (groupBy) {
            case 'week':
                groupByFormat = '%Y-%W';
                break;
            case 'month':
                groupByFormat = '%Y-%m';
                break;
            default:
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

        res.json({ geo_distribution: geo_dist, recent_activity: recent_activity, clicks_over_time: clicks_over_time });
    } catch(e) {
        console.error("ANALYTICS FETCH ERROR:", e);
        res.status(500).json({error: 'Impossibile recuperare gli analytics.'})
    }
}

/**
 * Get heatmap data for a specific link
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getHeatmap(req, res) {
    if (!req.user.company_id) return res.status(403).json({ error: 'Utente non associato a un\'azienda.' });

    try {
        const { linkId } = req.params;
        let { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            const today = new Date();
            endDate = today.toISOString().split('T')[0];
            today.setDate(today.getDate() - 6);
            startDate = today.toISOString().split('T')[0];
        }

        const link = db.prepare('SELECT id FROM links WHERE id = ? AND company_id = ?').get(linkId, req.user.company_id);
        if (!link) return res.status(404).json({ error: 'Link non trovato o non autorizzato.' });

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
}

/**
 * Process POS payment
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function processPayment(req, res) {
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
}

/**
 * Get geostats for a specific link
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function getGeostats(req, res) {
    if (!req.user.company_id) {
        return res.status(403).json({ error: 'Utente non associato a un\'azienda.' });
    }

    try {
        const { linkId } = req.params;

        const link = db.prepare('SELECT id FROM links WHERE id = ? AND company_id = ?').get(linkId, req.user.company_id);
        if (!link) {
            return res.status(404).json({ error: 'Link non trovato o non autorizzato.' });
        }

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
}

module.exports = {
    getWallet,
    getLinks,
    getAnalytics,
    getHeatmap,
    processPayment,
    getGeostats
};