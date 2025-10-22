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
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Sei un coach motivazionale. Genera una frase motivazionale breve (massimo 2 frasi) e di grande impatto per l'utente "ID-${keychainId}". Non includere saluti o convenevoli, solo la frase.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Errore durante la chiamata a Gemini:", error.message);
        return "La motivazione è dentro di te, non smettere di cercarla."; // Fallback
    }
}

// Function to handle motivational app request
async function handleMotivationalRequest(req, res) {
    if (req.path === '/') {
        const keychainId = req.query.id || 'Ospite';
        console.log(`[MOTIVAZIONAL] Scansione ricevuta da ID: ${keychainId}`);

        // Increment view counter asynchronously
        db.prepare(`INSERT INTO motivational_analytics (keychain_id, view_count) VALUES (?, 1) ON CONFLICT(keychain_id) DO UPDATE SET view_count = view_count + 1`).run(keychainId);

        const quote = await getMotivationalQuote(keychainId);

        // Build HTML page
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
                    p { font-size: 28px; font-weight: 600; line-height: 1.4; margin-top: 15px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Ciao, ${keychainId}</h1>
                    <p>"${quote}"</p>
                </div>
            </body>
            </html>
        `;
        res.send(htmlPage);
    } else {
        // If requesting other pages on motivational domain, return 404
        res.status(404).send('Pagina non trovata.');
    }
}

// Diagnostic function for Gemini models
async function listAvailableModels() {
    if (!genAI) {
        console.error("[DIAGNOSI] genAI non inizializzato.");
        return;
    }
    try {
        console.log("[DIAGNOSI] Provo a listare i modelli...");

        // Attempt to use the base model
        const modelNameToTest = "gemini-2.5-flash";
        const model = genAI.getGenerativeModel({ model: modelNameToTest });
        console.log(`[DIAGNOSI] Tentativo di usare il modello base: ${modelNameToTest}`);
        const result = await model.generateContent("Ciao");
        console.log("[DIAGNOSI] Chiamata di test con gemini-pro RIUSCITA!");

    } catch (error) {
        console.error(`[DIAGNOSI] Errore durante il test del modello base: ${error.message}`);
        if (error.status === 404) {
            console.error("[DIAGNOSI] Il modello gemini-pro NON è trovato per questa chiave/progetto/versione API.");
        } else if (error.status === 400 && error.message.includes('API key not valid')) {
            console.error("[DIAGNOSI] ERRORE CHIAVE API: La chiave API non è valida o non ha i permessi corretti.");
        } else if (error.message.includes('Billing')) {
            console.error("[DIAGNOSI] ERRORE BILLING: Controlla che il billing sia abilitato per il progetto Google Cloud.");
        } else {
            console.error("[DIAGNOSI] Altro errore:", error);
        }
    }
}

module.exports = {
    getMotivationalQuote,
    handleMotivationalRequest,
    listAvailableModels
};
