// Importa il database (percorso confermato src/db)
const db = require('../db');

exports.syncPhrases = async (req, res) => {
    try {
        const phrases = req.body;
        
        if (!Array.isArray(phrases)) {
            return res.status(400).json({ error: 'Dati non validi: atteso un array' });
        }
        
        function mapCategory(n8nCategory) {
            const categoryMap = {
                'motivazione_personale': 'motivazione',
                'studio_apprendimento': 'studio', 
                'successo_resilienza': 'successo'
            };
            return categoryMap[n8nCategory] || 'motivazione';
        }
        
        // Transazione per inserimento massivo
        const syncTransaction = db.transaction((phrases) => {
            // Pulisci la tabella
            db.prepare('DELETE FROM motivational_phrases').run();
            
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
                    console.warn(`Skip: ${phrase.Frase?.substring(0, 10)}...`);
                }
            }
            return count;
        });

        const insertedCount = syncTransaction(phrases);
        console.log(`✅ Sincronizzate ${insertedCount} frasi.`);
        res.json({ success: true, count: insertedCount });
        
    } catch (error) {
        console.error("❌ Errore sync:", error);
        res.status(500).json({ error: 'Errore server sync' });
    }
};
