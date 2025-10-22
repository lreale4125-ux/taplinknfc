const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const { recordClick } = require('../utils/analytics');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Redirect route for links
router.get('/r/:linkId', (req, res) => {
    try {
        const link = db.prepare(`SELECT url, id FROM links WHERE id = ?`).get(req.params.linkId);
        if (!link) return res.status(404).send('Link non trovato.');
        recordClick(link.id, null, req);
        res.redirect(link.url);
    } catch (error) {
        res.status(500).send('Errore del server.');
    }
});

// Redirect route for keychains
router.get('/k/:keychainId', (req, res) => {
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

// Geocoding proxy route
router.get('/geocode', authenticateToken, async (req, res) => {
    const { q } = req.query;

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
            res.json(data.results[0].geometry);
        } else {
            res.status(404).json({ lat: null, lng: null });
        }
    } catch (error) {
        console.error('Errore Geocoding Proxy:', error);
        res.status(500).json({ error: 'Errore durante la chiamata al servizio di geocoding.' });
    }
});

module.exports = router;