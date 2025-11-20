const express = require('express');
const router = express.Router();
const phrasesController = require('../controllers/n8nController');

// POST /api/sync-phrases
router.post('/sync-phrases', phrasesController.syncPhrases);

module.exports = router;
