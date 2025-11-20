const db = require('../db'); // Assicurati che src/db.js esista

exports.syncPhrases = async (req, res) => {
    try {
        const phrases = req.body;
        
        if (!Array.isArray(phrases)) {
            return res.status(400).json({ error: 'Dati non validi: atteso un array' });
        }
        
        // Helper per mappare le categorie
        function mapCategory(n8nCategory) {
            const categoryMap = {
                'motivazione_personale': 'motivazione',
                'studio_apprendimento': 'studio', 
                'successo_resilienza': 'successo'
            };
            return categoryMap[n8nCategory] || 'motivazione';
        }
        
        // Transazione per sicurezza (opzionale ma consigliata con SQLite per molti insert)
        const syncTransaction = db.transaction((phrases) => {
            // 1. Pulisci tabella
            db.prepare('DELETE FROM motivational_phrases').run();
            
            // 2. Prepara statement
            const insertStmt = db.prepare(`
                INSERT INTO motivational_phrases (phrase_text, category, author) 
                VALUES (?, ?, ?)
            `);
            
            let count = 0;
            for (const phrase of phrases) {
                try {
                    const mappedCategory = mapCategory(phrase.Categoria);
                    insertStmt.run(phrase.Frase, mappedCategory, phrase.Autori);
                    count++;
                } catch (e) {
                    console.warn(`Skip frase non valida: ${phrase.Frase?.substring(0, 20)}...`);
                }
            }
            return count;
        });

        const insertedCount = syncTransaction(phrases);
        
        console.log(`✅ Sincronizzate ${insertedCount} frasi nel database`);
        res.json({ success: true, count: insertedCount });
        
    } catch (error) {
        console.error("❌ Errore sincronizzazione frasi:", error);
        res.status(500).json({ error: 'Errore interno del server durante la sincronizzazione' });
    }
};
