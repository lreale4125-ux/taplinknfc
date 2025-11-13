const express = require('express');
const { login, register, googleAuth } = require('../controllers/authController'); // 🎯 Aggiungi googleAuth

const router = express.Router();

// --- Rotte ---
// Login per tutti gli utenti (wallet, analytics, POS ecc.)
router.post('/login', login);

// Registrazione "motivazionale"
router.post('/register', register);

// 🎯 Aggiungi route Google OAuth
router.post('/google', googleAuth);

module.exports = router;
