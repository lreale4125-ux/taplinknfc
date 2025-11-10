const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('../db');

let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
    console.warn('GEMINI_API_KEY non trovata nel .env. Le funzioni motivazionali non funzioneranno.');
}

// Function to get motivational quote, ora accetta l'argomento (topic)
async function getMotivationalQuote(keychainId, topic = 'motivazione') {
    if (!genAI) return "La motivazione è dentro di te, non smettere di cercarla."; // Fallback

    try {
        const timestamp = Date.now(); // Per garantire l'unicità
        
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        // PROMPT AGGIORNATO: Include l'argomento dinamico
        const prompt = `Sei un coach motivazionale. Genera una frase motivazionale breve (massimo 2 frasi) e di grande impatto per l'utente "ID-${keychainId}". La frase DEVE essere strettamente inerente all'argomento: "${topic}". Assicurati che sia una frase unica. Timestamp:${timestamp}. Non includere saluti o convenevoli, solo la frase.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Errore durante la chiamata a Gemini:", error.message);
        return "La motivazione è dentro di te, non smettere di cercarla."; // Fallback
    }
}

// NUOVA Function: Estrae ID e Argomento dalla query e restituisce la frase
async function getQuoteOnly(req, res) {
    const keychainId = req.query.id || 'Ospite';
    const topic = req.query.topic || 'motivazione'; // Estrae l'argomento
    
    // Passa l'ID e l'argomento alla funzione Gemini
    const quote = await getMotivationalQuote(keychainId, topic); 
    
    if (quote === "La motivazione è dentro di te, non smettere di cercarla.") {
        return res.status(500).json({ error: "Gemini API Fallita", quote: quote });
    }
    
    res.json({ quote: quote }); // Risposta JSON OK
}

// Function to handle motivational app request (Gestisce la pagina HTML)
async function handleMotivationalRequest(req, res) {
    if (req.path === '/') {
        const keychainId = req.query.id || 'Ospite';
        // Estrae 'topic' dalla URL, se non c'è usa 'motivazione'
        const topic = req.query.topic || 'motivazione'; 

        console.log(`[MOTIVAZIONAL] Scansione ricevuta da ID: ${keychainId}. Argomento: ${topic}`);

        // Increment view counter ASINCRONAMENTE
        db.prepare(`INSERT INTO motivational_analytics (keychain_id, view_count) VALUES (?, 1) ON CONFLICT(keychain_id) DO UPDATE SET view_count = view_count + 1`).run(keychainId);

        const htmlPage = `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Frase Motivazionale</title>
                <style>
                    /* Reset base */
                    * {
                        box-sizing: border-box;
                    }
                    body {
                        margin: 0;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        background-color: #f3e8e8;
                        color: #1a1a1a;
                        display: flex;
                        flex-direction: column;
                        min-height: 100vh;
                        justify-content: space-between;
                    }
                    .header {
                        background-color: #caaeb3;
                        border-radius: 20px;
                        margin: 20px;
                        padding: 20px;
                        max-width: 480px;
                        align-self: center;
                    }
                    .header h1 {
                        font-weight: 900;
                        font-size: 1.6rem;
                        margin: 0 0 10px 0;
                        line-height: 1.2;
                    }
                    .header p {
                        font-weight: 300;
                        font-size: 0.9rem;
                        margin: 0;
                        opacity: 0.75;
                    }
                    main {
                        flex-grow: 1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        padding: 10px 20px;
                        max-width: 480px;
                        margin: 0 auto;
                        text-align: center;
                    }
                    main h2 {
                        font-weight: 800;
                        font-size: 1.2rem;
                        margin: 20px 0 10px 0;
                        color: #0a2f5d;
                    }
                    main span {
                        font-weight: 600;
                        color: #0a2f5d;
                    }
                    #quote-text {
                        margin-top: 15px;
                        font-size: 1.1rem;
                        font-weight: 400;
                        min-height: 60px;
                        color: #333;
                        line-height: 1.4;
                    }
                    .footer {
                        background-color: #d7d9df;
                        text-align: center;
                        padding: 12px 10px;
                        font-size: 0.8rem;
                        color: #555;
                        user-select: none;
                    }
                    .bottom-bar {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        gap: 15px;
                        margin: 20px auto 10px auto;
                        max-width: 480px;
                    }
                    button, .icon-button {
                        cursor: pointer;
                        border: none;
                        border-radius: 20px;
                        padding: 10px 20px;
                        font-weight: 600;
                        font-size: 0.9rem;
                        user-select: none;
                        transition: background-color 0.3s ease;
                    }
                    button {
                        background-color: #caaeb3;
                        color: #1a1a1a;
                    }
                    button:hover {
                        background-color: #b49499;
                    }
                    .icon-button {
                        background: none;
                        font-size: 1.5rem;
                        color: #1a1a1a;
                    }
                    .icon-button:hover {
                        color: #caaeb3;
                    }
                    /* Hamburger menu icon */
                    .hamburger {
                        display: inline-block;
                        width: 22px;
                        height: 16px;
                        position: relative;
                    }
                    .hamburger span {
                        background: #1a1a1a;
                        position: absolute;
                        height: 3px;
                        width: 100%;
                        border-radius: 3px;
                        left: 0;
                        transition: 0.3s ease;
                    }
                    .hamburger span:nth-child(1) {
                        top: 0;
                    }
                    .hamburger span:nth-child(2) {
                        top: 6.5px;
                    }
                    .hamburger span:nth-child(3) {
                        top: 13px;
                    }
                    @media (max-width: 600px) {
                        .header, main, .bottom-bar {
                            margin: 10px 15px;
                            max-width: 100%;
                        }
                        .header h1 {
                            font-size: 1.3rem;
                        }
                        main h2 {
                            font-size: 1.1rem;
                        }
                        #quote-text {
                            font-size: 1rem;
                        }
                        button, .icon-button {
                            padding: 8px 15px;
                            font-size: 0.85rem;
                        }
                        .icon-button {
                            font-size: 1.3rem;
                        }
                    }
                </style>
            </head>
            <body>
                <header class="header">
                    <h1>365 giorni per una versione più felice di te</h1>
                    <p>Consigli e ispirazioni per vivere al meglio la tua vita</p>
                </header>
                <main>
                    <h2>Scopri una frase su <span id="topic-text">${topic}</span></h2>
                    <div id="quote-text">Caricamento della tua motivazione...</div>
                </main>
                <div class="bottom-bar">
                    <button class="icon-button" aria-label="Menu">
                        <div class="hamburger" role="img" aria-label="Menu icon">
                            <span></span><span></span><span></span>
                        </div>
                    </button>
                    <button id="change-topic-btn">CAMBIA ARGOMENTO</button>
                    <button class="icon-button" aria-label="Preferito">♥</button>
                </div>
                <footer class="footer">Diritti ecc.</footer>
                <script>
                    const keychainId = '${keychainId}';
                    const topic = '${topic}';
                    document.getElementById('topic-text').innerText = topic;

                    async function loadQuote() {
                        try {
                            // CHIAMATA AGGIORNATA: Passa l'argomento (topic) alla chiamata API
                            const response = await fetch('/api/quote?id=' + encodeURIComponent(keychainId) + '&topic=' + encodeURIComponent(topic));
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

                    document.getElementById('change-topic-btn').addEventListener('click', () => {
                        // LOGICA AGGIORNATA: Reindirizza con il nuovo argomento
                        const newTopic = prompt("Inserisci un nuovo argomento:", topic) || topic;
                        // Ricostruisce la URL includendo sempre l'ID per non perderlo
                        window.location.search = '?id=' + encodeURIComponent(keychainId) + '&topic=' + encodeURIComponent(newTopic);
                    });
                </script>
            </body>
            </html>
        `;
        res.send(htmlPage);
    } else {
        res.status(404).send('Pagina non trovata.');
    }
}

// Diagnostic function for Gemini models (Invariata)
async function listAvailableModels() {
    console.log("[TEST MODE] listAvailableModels non in uso.");
    return []; 
}


module.exports = {
    getMotivationalQuote,
    handleMotivationalRequest,
    getQuoteOnly,
    listAvailableModels
};
