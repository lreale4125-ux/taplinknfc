const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('../db');

let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
    console.warn('GEMINI_API_KEY non trovata nel .env. Le funzioni motivazionali non funzioneranno.');
}

// Function to get motivational quote
async function getMotivationalQuote(keychainId) {
    if (!genAI) return "La motivazione è dentro di te, non smettere di cercarla."; // Fallback

    try {
        // Aggiungi la definizione di timestamp qui! 👈 CORREZIONE
        const timestamp = Date.now(); 
        
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        // Usa il timestamp definito
        const prompt = `Sei un coach motivazionale. Genera una frase motivazionale breve (massimo 2 frasi) e di grande impatto per l'utente "ID-${keychainId}". Assicurati che sia una frase unica. Timestamp:${timestamp}. Non includere saluti o convenevoli, solo la frase.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        // Se c'è un errore (es. chiave API non valida), questo log è fondamentale per il debug!
        console.error("Errore durante la chiamata a Gemini:", error.message); 
        return "La motivazione è dentro di te, non smettere di cercarla."; // Fallback
    }
}

// NUOVA Function: Restituisce solo la frase motivazionale in formato JSON
async function getQuoteOnly(req, res) {
    const keychainId = req.query.id || 'Ospite';
    
    // getMotivationalQuote può fallire e restituire il messaggio di fallback
    const quote = await getMotivationalQuote(keychainId); 
    
    // Per un debug avanzato: se il fallback è presente, potresti restituire 500
    if (quote === "La motivazione è dentro di te, non smettere di cercarla.") {
        return res.status(500).json({ error: "Gemini API Fallita", quote: quote });
    }
    
    res.json({ quote: quote }); // Risposta JSON OK
}

// Function to handle motivational app request (Invariata - la logica 404 è ora nel server.js)
async function handleMotivationalRequest(req, res) {
    if (req.path === '/') {
        const keychainId = req.query.id || 'Ospite';
        console.log(`[MOTIVAZIONAL] Scansione ricevuta da ID: ${keychainId}`);

        // Increment view counter ASINCRONAMENTE e NON-BLOCCANTE (ottimo)
        db.prepare(`INSERT INTO motivational_analytics (keychain_id, view_count) VALUES (?, 1) ON CONFLICT(keychain_id) DO UPDATE SET view_count = view_count + 1`).run(keychainId);

        // Build HTML page (invariata)
        const htmlPage = `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>La tua Frase del Giorno</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin: 0; padding: 20px; box-sizing: border-box; }
                    .card { 
                        background: rgba(255, 255, 255, 0.1); 
                        backdrop-filter: blur(10px); 
                        border-radius: 20px; 
                        padding: 40px; 
                        max-width: 600px; 
                        text-align: center; 
                        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); 
                    }
                    h1 { font-size: 20px; opacity: 0.8; margin: 0; }
                    #quote-text { 
                        font-size: 28px; 
                        font-weight: 600; 
                        line-height: 1.4; 
                        margin-top: 15px; 
                        min-height: 40px; /* Evita 'salti' quando il contenuto arriva */
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Ciao, ${keychainId}</h1>
                    <p id="quote-text">Caricamento della tua motivazione...</p> 
                </div>
                
                <script>
                    // Script per recuperare la frase in modo asincrono (lato client)
                    async function loadQuote() {
                        try {
                            // Chiama il nuovo endpoint /api/quote
                            const response = await fetch('/api/quote?id=${keychainId}'); 
                            
                            // Aggiunto per debug: se il server restituisce 404/500, forziamo l'errore
                            if (!response.ok) {
                                throw new Error('Risposta server non OK. Status: ' + response.status);
                            }

                            const data = await response.json();
                            document.getElementById('quote-text').innerText = '"' + data.quote + '"';
                        } catch (e) {
                            console.error("Errore nel caricamento della frase:", e);
                            document.getElementById('quote-text').innerText = ':( La motivazione è dentro di te, non smettere di cercarla.';
                        }
                    }
                    loadQuote();
                </script>
            </body>
            </html>
        `;
        res.send(htmlPage); // Invio IMMEDIATO della pagina
    } else {
        // Se si richiede una pagina diversa dalla root sul dominio motivazionale, 
        // questa parte del codice non viene mai eseguita grazie alla logica in server.js, 
        // ma la lasciamo per sicurezza.
        res.status(404).send('Pagina non trovata.');
    }
}

// Diagnostic function for Gemini models (Invariata)
async function listAvailableModels() {
    // ... (funzione listAvailableModels omessa per brevità, è invariata) ...
}


module.exports = {
    getMotivationalQuote,
    handleMotivationalRequest,
    getQuoteOnly, // *** NUOVA ESPORTAZIONE ***
    listAvailableModels
};
