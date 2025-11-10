// const { GoogleGenerativeAI } = require("@google/generative-ai"); // DISABILITATO PER TEST
const db = require('../db');

/* // DISABILITATO PER TEST
let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
    console.warn('GEMINI_API_KEY non trovata nel .env. Le funzioni motivazionali non funzioneranno.');
}
*/

/**
 * FUNZIONE MODIFICATA PER IL TEST
 * Bypassiamo completamente Gemini e restituiamo una frase statica.
 */
async function getMotivationalQuote(keychainId) {
    console.log(`[TEST MODE] getMotivationalQuote chiamata per ID: ${keychainId}. Bypass di Gemini.`);
    
    // Restituisce una frase di test per confermare che il flusso funziona
    return "Test di successo: la pagina funziona senza Gemini.";
}

// NUOVA Function: Restituisce solo la frase motivazionale in formato JSON
// QUESTA FUNZIONE ORA RICEVERÀ LA FRASE DI TEST
async function getQuoteOnly(req, res) {
    const keychainId = req.query.id || 'Ospite';
    
    // Questa chiamata ora userà la funzione di test qui sopra
    const quote = await getMotivationalQuote(keychainId); 
    
    // Questo controllo (sulla vecchia frase di fallback) non sarà più triggerato,
    // il che è corretto per il nostro test.
    if (quote === "La motivazione è dentro di te, non smettere di cercarla.") {
        return res.status(500).json({ error: "Gemini API Fallita", quote: quote });
    }
    
    res.json({ quote: quote }); // Risposta JSON OK
}

// Function to handle motivational app request (Invariata - Questa parte funziona già)
async function handleMotivationalRequest(req, res) {
    if (req.path === '/') {
        const keychainId = req.query.id || 'Ospite';
        console.log(`[MOTIVAZIONAL] Scansione ricevuta da ID: ${keychainId}`);

        // Increment view counter ASINCRONAMENTE (Questo continuerà a funzionare)
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
                    .card { background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border-radius: 20px; padding: 40px; max-width: 600px; text-align: center; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
                    h1 { font-size: 20px; opacity: 0.8; margin: 0; }
                    #quote-text { font-size: 28px; font-weight: 600; line-height: 1.4; margin-top: 15px; min-height: 40px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Ciao, ${keychainId}</h1>
                    <p id="quote-text">Caricamento della tua motivazione...</p> 
                </div>
                
                <script>
                    // Questo script lato client è invariato e chiamerà /api/quote
                    async function loadQuote() {
                        try {
                            const response = await fetch('/api/quote?id=${keychainId}'); 
                            if (!response.ok) {
                                throw new Error('Risposta server non OK. Status: ' + response.status);
                            }
                            const data = await response.json();
                           // Verrà mostrata la frase di test qui
                            document.getElementById('quote-text').innerText = '"' + data.quote + '"'; 
                        } catch (e) {
                            console.error("Errore nel caricamento della frase:", e);
                            document.getElementById('quote-text').innerText = ':( La motivazione è dentro di te, non smettere di cercarla.';
                    _   }
                    }
                    loadQuote();
                </script>
            </body>
            </html>
        `;
        res.send(htmlPage); // Invio IMMEDIATO della pagina
    } else {
        res.status(404).send('Pagina non trovata.');
    }
}

// Diagnostic function for Gemini models (DISABILITATA)
async function listAvailableModels() {
    console.log("[TEST MODE] listAvailableModels non in uso.");
    return []; // Restituisce un array vuoto
}


module.exports = {
    getMotivationalQuote,
    handleMotivationalRequest,
    getQuoteOnly,
    listAvailableModels
};
