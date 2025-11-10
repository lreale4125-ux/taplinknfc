const express = require('express');
const { login, register } = require('../controllers/authController');

const router = express.Router();

// --- Rotte ---
// Login per tutti gli utenti (wallet, analytics, POS ecc.)
router.post('/login', login);

// Registrazione "motivazionale": gli utenti registrati qui
// vengono automaticamente reindirizzati alla loro pagina motivazionale
router.post('/register', register);

module.exports = router;
