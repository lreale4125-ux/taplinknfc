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
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        margin: 0;
                        padding: 1rem;
                        box-sizing: border-box;
                        overflow-x: hidden;
                    }
                    .card {
                        background: rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(10px);
                        border-radius: 1.5rem;
                        padding: 2rem;
                        max-width: 90vw;
                        width: 100%;
                        text-align: center;
                        box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.3);
                        animation: fadeIn 1s ease-in-out;
                        transition: transform 0.3s ease;
                    }
                    .card:hover {
                        transform: translateY(-5px);
                    }
                    h1 {
                        font-size: 1.25rem;
                        opacity: 0.8;
                        margin: 0 0 1rem 0;
                    }
                    p {
                        font-size: 1.75rem;
                        font-weight: 600;
                        line-height: 1.4;
                        margin: 0 0 2rem 0;
                    }
                    .heart-btn {
                        background: none;
                        border: none;
                        font-size: 2rem;
                        color: #ccc;
                        cursor: pointer;
                        transition: color 0.3s ease, transform 0.2s ease;
                        margin-top: 1rem;
                    }
                    .heart-btn:hover {
                        transform: scale(1.1);
                    }
                    .heart-btn.active {
                        color: #ff6b6b;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @media (max-width: 768px) {
                        .card {
                            padding: 1.5rem;
                            border-radius: 1rem;
                        }
                        h1 {
                            font-size: 1rem;
                        }
                        p {
                            font-size: 1.5rem;
                        }
                        .heart-btn {
                            font-size: 1.5rem;
                        }
                    }
                    @media (max-width: 480px) {
                        body {
                            padding: 0.5rem;
                        }
                        .card {
                            padding: 1rem;
                        }
                        h1 {
                            font-size: 0.9rem;
                        }
                        p {
                            font-size: 1.25rem;
                        }
                        .heart-btn {
                            font-size: 1.25rem;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Ciao, ${keychainId}</h1>
                    <p>"${quote}"</p>
                    <button class="heart-btn" id="heartBtn">♥</button>
                </div>
                <script>
                    const heartBtn = document.getElementById('heartBtn');
                    heartBtn.addEventListener('click', function() {
                        this.classList.toggle('active');
                    });
                </script>
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
