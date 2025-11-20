const path = require('path');
const express = require('express');

// CORRETTO: Importa il servizio con la 't' (inglese) come mi hai confermato
const { getQuoteOnly, updateUserNickname } = require('../services/motivational');

const motivationalAppHandler = async (req, res, next) => {
    const motiDomains = ['motivazional.taplinknfc.it', 'www.motivazional.taplinknfc.it'];

    if (!motiDomains.includes(req.hostname)) {
        return next();
    }

    if (req.path === '/api/quote') {
        return await getQuoteOnly(req, res);
    }

    if (req.path === '/api/update-nickname' && req.method === 'POST') {
        return await updateUserNickname(req, res);
    }

    // Percorso per la cartella public/motivazional
    const motivationalPath = path.join(__dirname, '../../public', 'motivazional');

    if (req.path === '/' || req.path.startsWith('/assets/') || req.path.startsWith('/static/') || req.path.match(/\.(json|ico|png|jpg|jpeg|svg|css|js)$/)) {
        return express.static(motivationalPath)(req, res, next);
    }

    res.sendFile(path.join(motivationalPath, 'index.html'), (err) => {
        if (err) {
            console.error("Errore index.html:", err);
            next();
        }
    });
};

module.exports = motivationalAppHandler;
