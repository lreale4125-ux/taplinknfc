const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const { recordClick } = require('../utils/analytics');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Funzione di utilità per recuperare l'URL finale (per i reindirizzamenti)
async function getFinalUrl(linkId) {
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

    if (linkData.selector_id && linkData.selector_url) {
        return linkData.selector_url;
    }
    
    return linkData.link_url;
}

// NUOVA FUNZIONE PER GESTIRE ANALYTICS SENZA ERRORI
async function safeRecordClick(linkId, keychainId, req, source) {
    try {
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || 'Unknown';

        console.log(`📊 Analytics: link=${linkId}, keychain=${keychainId}, source=${source}, ip=${ipAddress}`);

        // PRIMA prova UPDATE
        const updateResult = db.prepare(`
            UPDATE analytics 
            SET click_count = click_count + 1, 
                last_seen = CURRENT_TIMESTAMP,
                user_agent = ?
            WHERE link_id = ? AND ip_address = ? AND keychain_id = ? AND source = ?
        `).run(userAgent, linkId, ipAddress, keychainId, source);

        // Se UPDATE non ha modificato righe, fai INSERT
        if (updateResult.changes === 0) {
            db.prepare(`
                INSERT INTO analytics (
                    link_id, keychain_id, ip_address, user_agent, source
                ) VALUES (?, ?, ?, ?, ?)
            `).run(linkId, keychainId, ipAddress, userAgent, source);
            
            console.log('✅ Nuovo record analytics inserito');
        } else {
            console.log('✅ Record analytics aggiornato');
        }

    } catch (error) {
        console.error('❌ Errore in analytics (non blocca redirect):', error.message);
        // NON bloccare il redirect per errori analytics
    }
}

// Redirect route for links
router.get('/r/:linkId', async (req, res) => {
    try {
        const finalUrl = await getFinalUrl(req.params.linkId);
        
        if (!finalUrl) return res.status(404).send('Link o Selettore non trovato.');
        
        // Usa la nuova funzione safe
        await safeRecordClick(req.params.linkId, null, req, 'direct');
        
        res.redirect(finalUrl);
        
    } catch (error) {
        console.error("Errore nel reindirizzamento /r/:linkId:", error.message);
        res.status(500).send('Errore del server.');
    }
});

// Redirect route for keychains (Supporta keychain_number con prefisso QA)
router.get('/k/:keychainIdentifier', async (req, res) => {
    try {
        const keychainIdentifier = req.params.keychainIdentifier;
        let source = 'nfc';
        let lookupValue = keychainIdentifier;

        // Determina la sorgente in base al prefisso QA
        if (keychainIdentifier.toUpperCase().startsWith('QA')) {
            source = 'qr';
        } else {
            // Se è un numero puro (1, 2, 3), convertilo in QA1, QA2, QA3
            source = 'nfc';
            lookupValue = 'QA' + keychainIdentifier;
        }

        console.log(`🔍 Ricerca keychain: ${lookupValue}, source: ${source}`);

        // Cerca il keychain per keychain_number
        const keychain = db.prepare(`SELECT id, link_id FROM keychains WHERE keychain_number = ?`).get(lookupValue);
        
        if (!keychain) {
            console.log(`❌ Keychain '${lookupValue}' non trovato`);
            return res.status(404).send(`Keychain '${lookupValue}' non trovato.`);
        }
        
        const finalUrl = await getFinalUrl(keychain.link_id);
        
        if (!finalUrl) {
            console.log(`❌ Link associato non trovato per keychain ${keychain.id}`);
            return res.status(404).send('Link associato non trovato.');
        }
        
        console.log(`✅ Keychain trovato: ${keychain.id}, link: ${keychain.link_id}, redirect: ${finalUrl}`);
        
        // Usa la nuova funzione safe
        await safeRecordClick(keychain.link_id, keychain.id, req, source);
        
        res.redirect(finalUrl);
        
    } catch (error) {
        console.error("Errore nel reindirizzamento /k/:keychainIdentifier:", error.message);
        res.status(500).send('Errore del server.');
    }
});

// Geocoding proxy route
router.get('/geocode', async (req, res) => {
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
