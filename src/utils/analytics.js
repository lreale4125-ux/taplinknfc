const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const { recordClick } = require('../utils/analytics');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Funzione di utilità per recuperare l'URL finale (per i reindirizzamenti)
async function getFinalUrl(linkId) {
    // Query che recupera il link e, se presente, l'URL dal selettore
    const linkQuery = `
        SELECT 
            l.url AS link_url,
            s.redirect_url AS selector_url,
            l.selector_id
        FROM links l
        LEFT JOIN selectors s ON l.selector_id = s.id
        WHERE l.id = ?`;
        
    const linkData = db.prepare(linkQuery).get(linkId);

    if (!linkData) return null;

    // Se esiste un selector_id E il selector_url è definito, usa il selector_url (il punto di forza!)
    if (linkData.selector_id && linkData.selector_url) {
        return linkData.selector_url;
    }
    
    // Altrimenti, usa l'url diretto del link
    return linkData.link_url;
}

// Redirect route for links
router.get('/r/:linkId', async (req, res) => {
    try {
        const finalUrl = await getFinalUrl(req.params.linkId);
        
        if (!finalUrl) return res.status(404).send('Link o Selettore non trovato.');
        
        // Traccia il click (assumendo che recordClick possa essere sincrono o gestito qui)
        recordClick(req.params.linkId, null, req, 'direct');
        
        // Esegue il reindirizzamento
        res.redirect(finalUrl);
        
    } catch (error) {
        console.error("Errore nel reindirizzamento /r/:linkId:", error.message);
        res.status(500).send('Errore del server.');
    }
});

// Redirect route for keychains (Supporta keychain_number con prefisso AQ)
router.get('/k/:keychainIdentifier', async (req, res) => {
    try {
        const keychainIdentifier = req.params.keychainIdentifier;
        let source = 'nfc';
        let lookupValue = keychainIdentifier;

        // Determina la sorgente in base al prefisso
        if (keychainIdentifier.toUpperCase().startsWith('AQ')) {
            source = 'qr';
            lookupValue = keychainIdentifier.substring(2); // Rimuove "AQ"
        }

        // Cerca il keychain per keychain_number (supporta sia numerico che stringa)
        const keychain = db.prepare(`SELECT id, link_id FROM keychains WHERE keychain_number = ?`).get(lookupValue);
        
        if (!keychain) {
            return res.status(404).send('Keychain non trovato.');
        }
        
        const finalUrl = await getFinalUrl(keychain.link_id);
        
        if (!finalUrl) return res.status(404).send('Link associato non trovato.');
        
        // Traccia il click con la sorgente corretta
        recordClick(keychain.link_id, keychain.id, req, source);
        res.redirect(finalUrl);
        
    } catch (error) {
        console.error("Errore nel reindirizzamento /k/:keychainIdentifier:", error.message);
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
