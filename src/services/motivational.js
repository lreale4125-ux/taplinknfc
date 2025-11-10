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
                    :root {
                        --primary-color: #667eea;
                        --secondary-color: #764ba2;
                        --accent-color: #ff6b6b;
                        --text-color: white;
                        --card-bg: rgba(255, 255, 255, 0.1);
                    }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
                        color: var(--text-color);
                        margin: 0;
                        padding: 1rem;
                        box-sizing: border-box;
                        overflow-x: hidden;
                    }
                    .card {
                        background: var(--card-bg);
                        backdrop-filter: blur(15px);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 2rem;
                        padding: 3rem 2rem;
                        max-width: 600px;
                        width: 100%;
                        text-align: center;
                        box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.4);
                        animation: fadeIn 1.2s ease-in-out;
                        transition: transform 0.3s ease;
                    }
                    .card:hover {
                        transform: translateY(-10px);
                    }
                    h1 {
                        font-size: 1.5rem;
                        font-weight: 300;
                        opacity: 0.9;
                        margin: 0 0 1.5rem 0;
                        letter-spacing: 0.5px;
                    }
                    p {
                        font-size: 2rem;
                        font-weight: 500;
                        line-height: 1.3;
                        margin: 0 0 2.5rem 0;
                        font-style: italic;
                    }
                    .heart-btn {
                        background: none;
                        border: none;
                        font-size: 3rem;
                        color: #ddd;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        margin-top: 1rem;
                        outline: none;
                    }
                    .heart-btn:hover {
                        transform: scale(1.2);
                        color: var(--accent-color);
                    }
                    .heart-btn.active {
                        color: var(--accent-color);
                        animation: pulse 0.6s ease-in-out;
                    }
                    @keyframes pulse {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                        100% { transform: scale(1); }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(30px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @media (max-width: 768px) {
                        .card {
                            padding: 2rem 1.5rem;
                            border-radius: 1.5rem;
                        }
                        h1 {
                            font-size: 1.25rem;
                        }
                        p {
                            font-size: 1.75rem;
                        }
                        .heart-btn {
                            font-size: 2.5rem;
                        }
                    }
                    @media (max-width: 480px) {
                        body {
                            padding: 0.5rem;
                        }
                        .card {
                            padding: 1.5rem 1rem;
                            border-radius: 1rem;
                        }
                        h1 {
                            font-size: 1.1rem;
                        }
                        p {
                            font-size: 1.5rem;
                        }
                        .heart-btn {
                            font-size: 2rem;
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
