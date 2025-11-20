const path = require('path');
const express = require('express');
const { getQuoteOnly, updateUserNickname } = require('../services/motivational');

const motivationalAppHandler = async (req, res, next) => {
    const motiDomains = ['motivazional.taplinknfc.it', 'www.motivazional.taplinknfc.it'];

    // Se non è il dominio target, passa al prossimo middleware
    if (!motiDomains.includes(req.hostname)) {
        return next();
    }

    // 🎯 API specifiche per questo dominio (Gestite direttamente qui per priorità)
    if (req.path === '/api/quote') {
        return await getQuoteOnly(req, res);
    }

    if (req.path === '/api/update-nickname' && req.method === 'POST') {
        return await updateUserNickname(req, res);
    }

    // Percorso della cartella pubblica rinominata
    // Nota: __dirname qui è dentro /src/middleware, quindi saliamo di due livelli
    const motivationalPath = path.join(__dirname, '../../public', 'motivazional');

    // 🎯 Serve i file statici di React (JS, CSS, Immagini)
    if (req.path === '/' || req.path.startsWith('/assets/') || req.path.startsWith('/static/') || req.path.match(/\.(json|ico|png|jpg|jpeg|svg|css|js)$/)) {
        return express.static(motivationalPath)(req, res, next);
    }

    // 🎯 Fallback per SPA (React Router): Serve sempre index.html per percorsi non trovati
    res.sendFile(path.join(motivationalPath, 'index.html'), (err) => {
        if (err) {
            console.error("Index motivational non trovato in:", motivationalPath, err);
            next(); // Se manca la build, evita che il server si blocchi
        }
    });
};

module.exports = motivationalAppHandler;
