const express = require('express');
const { login, register } = require('../controllers/authController');

const router = express.Router();

// --- Routes ---
// Login standard per tutti gli utenti (wallet, analytics, POS ecc.)
router.post('/login', login);

// Registrazione "motivazionale": tutti gli utenti che si registrano da qui
// vengono reindirizzati automaticamente alla loro pagina motivazionale
router.post('/register', register);

module.exports = router;
