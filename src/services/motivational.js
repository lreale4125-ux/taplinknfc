// --- src/services/motivational.js ---

const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('../db');
const jwt = require('jsonwebtoken');

let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
    console.warn('GEMINI_API_KEY non trovata nel .env. Le funzioni motivazionali non funzioneranno.');
}

/**
 * Genera una frase motivazionale unica per un utente, includendo l'argomento (topic).
 * @param {string} userNameOrId - Nome utente o ID (se nome non disponibile) da inserire nel prompt.
 * @param {string} topic
 * @returns {Promise<string>}
 */
async function getMotivationalQuote(userNameOrId, topic = 'motivazione') {
    if (!genAI) return "La motivazione è dentro di te, non smettere di cercarla."; // fallback

    try {
        const timestamp = Date.now();
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Corretto: Usa la variabile userNameOrId (che ora contiene lo username) nel prompt
        const prompt = `Sei un coach motivazionale. Genera una frase motivazionale breve (massimo 2 frasi) e di grande impatto per l'utente "${userNameOrId}". La frase DEVE essere strettamente inerente all'argomento: "${topic}". Assicurati che sia una frase unica. Timestamp:${timestamp}. Non includere saluti o convenevoli, solo la frase.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Errore durante la chiamata a Gemini:", error.message);
        return "La motivazione è dentro di te, non smettere di cercarla."; // fallback
    }
}

/**
 * Endpoint API: restituisce solo la frase motivazionale in formato JSON
 */
async function getQuoteOnly(req, res) {
    // Nota: Quando l'API è chiamata dal frontend, il token è nell'header.
    // Dobbiamo estrarre l'utente dall'HEADER per l'analytics, se presente.
    let keychainId = req.query.id || 'Ospite'; // Usato come fallback/username nel frontend
    let topic = req.query.topic || 'motivazione';
    let username = req.query.username || keychainId; // L'username viene passato nel parametro 'id' dal frontend

    let user = null;
    let token = null;

    // Tentativo di estrarre il token dall'header per validazione (se richiesto dal routing)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
        try {
            user = jwt.verify(token, process.env.JWT_SECRET);
            // Se autenticato, usa i dati reali per analytics (keychainId è l'ID)
            keychainId = user.id || keychainId;
            username = user.username || username;
        } catch (err) {
            console.warn('Token non valido in getQuoteOnly.');
        }
    }
    
    // Aggiorna analytics
    try {
        db.prepare(`
            INSERT INTO motivational_analytics (keychain_id, topic, view_count)
            VALUES (?, ?, 1)
            ON CONFLICT(keychain_id, topic) DO UPDATE SET view_count = view_count + 1
        `).run(keychainId, topic);
    } catch (dbError) {
        console.error("Errore DB in getQuoteOnly:", dbError.message);
    }

    // Passa lo username per la generazione della frase
    const quote = await getMotivationalQuote(username, topic); 
    res.json({ quote });
}

/**
 * Gestisce la richiesta della pagina motivazionale con HTML + fetch lato client
 */
async function handleMotivationalRequest(req, res) {
    // 🎯 RIMOZIONE LOGICA LATO SERVER PER TOKEN E USERNAME
    // La gestione dell'utente autenticato e del topic iniziale è demandata al frontend (localStorage).
    
    // Solo per la prima visualizzazione (Ospite), usiamo un topic di base.
    const topicFromUrl = req.query.topic || 'motivazione';
    
    // HTML della pagina motivazionale
    const htmlPage = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Frase Motivazionale</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #f3e8e8 0%, #e8f3f3 100%); color: #333; display: flex; flex-direction: column; min-height: 100vh; justify-content: space-between; line-height: 1.6; }
        .header { background: linear-gradient(135deg, #caaeb3 0%, #b49499 100%); border-radius: 25px; margin: 20px; padding: 30px 20px; max-width: 500px; align-self: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; }
        .header h1 { font-weight: 700; font-size: 1.8rem; margin: 0 0 15px 0; line-height: 1.3; color: #fff; }
        .header p { font-weight: 400; font-size: 1rem; margin: 0; opacity: 0.9; color: #fff; }
        main { flex-grow: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; max-width: 500px; margin: 0 auto; text-align: center; }
        main h2 { font-weight: 600; font-size: 1.4rem; margin: 20px 0 15px 0; color: #2c3e50; }
        main span { font-weight: 700; color: #3498db; }
        #quote-text { margin-top: 20px; font-size: 1.2rem; font-weight: 400; min-height: 80px; color: #34495e; line-height: 1.5; font-style: italic; background: rgba(255,255,255,0.8); padding: 20px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .bottom-bar { display: flex; justify-content: center; align-items: center; gap: 20px; margin: 20px auto 10px auto; max-width: 500px; }
        button, .icon-button { cursor: pointer; border: none; border-radius: 25px; padding: 12px 25px; font-weight: 600; font-size: 1rem; user-select: none; transition: all 0.3s ease; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
        button { background: linear-gradient(135deg, #caaeb3 0%, #b49499 100%); color: #fff; }
        button:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
    </style>
</head>
<body>
    <header class="header">
        <h1>365 giorni per una versione più felice di te</h1>
        <p>Consigli e ispirazioni per vivere al meglio la tua vita</p>
    </header>
    <main>
        <h2>Scopri una frase su <span id="topic-text">${topicFromUrl}</span></h2>
        <div id="quote-text">Caricamento della tua motivazione...</div>
    </main>
    <div class="bottom-bar">
        <button id="change-topic-btn">CAMBIA ARGOMENTO</button>
    </div>
    <script>
        // 🎯 LOGICA ORA GESTITA INTERAMENTE LATO CLIENT (LOCAL STORAGE)
        const loadQuote = async () => {
            const token = localStorage.getItem('authToken');
            const userData = JSON.parse(localStorage.getItem('userData'));
            const savedTopic = localStorage.getItem('lastTopic');

            // 1. Definisci USERNAME e TOPIC
            // Se l'utente è loggato, usa i suoi dati e l'ultimo topic salvato.
            // Altrimenti, usa i dati di 'Ospite' e il topic di default.
            const isUserLoggedIn = token && userData;
            const username = isUserLoggedIn ? userData.username : 'Ospite';
            const keychainId = isUserLoggedIn ? userData.id : 'Ospite'; // ID per analytics
            const topic = savedTopic || 'motivazione'; 
            
            // Aggiorna il testo del topic visualizzato
            document.getElementById('topic-text').innerText = topic;

            try {
                const headers = {};
                if (token) {
                    // 2. Invia il token nell'header per l'autenticazione lato server
                    headers['Authorization'] = 'Bearer ' + token;
                }
                
                // 3. Chiama l'API motivazionale.
                // Passiamo username e topic per la generazione della frase.
                // Passiamo keychainId per l'analytics del DB (nel caso in cui username e id siano diversi).
                const url = '/api/quote?' + 
                    'id=' + encodeURIComponent(keychainId) + // ID per Analytics (vecchio nome chiave)
                    '&username=' + encodeURIComponent(username) + // Username per Gemini (nuovo nome chiave)
                    '&topic=' + encodeURIComponent(topic);

                const response = await fetch(url, { headers });

                if (!response.ok) throw new Error('Server non OK: ' + response.status);
                
                const data = await response.json();
                document.getElementById('quote-text').innerText = '"' + data.quote + '"';
            } catch (e) {
                console.error("Errore caricamento frase:", e);
                document.getElementById('quote-text').innerText = ':( La motivazione è dentro di te, non smettere di cercarla.';
            }
        };
        loadQuote();

        document.getElementById('change-topic-btn').addEventListener('click', () => {
            const topicTextElement = document.getElementById('topic-text');
            const currentTopic = topicTextElement.innerText;

            const newTopic = prompt("Inserisci un nuovo argomento:", currentTopic) || currentTopic;
            
            if (newTopic !== currentTopic) {
                // 1. SALVA IL NUOVO ARGOMENTO in localStorage per la persistenza
                localStorage.setItem('lastTopic', newTopic);
                
                // 2. Ricarica la pagina. La logica di loadQuote() caricherà il nuovo topic.
                // L'URL pulito è preferibile:
                window.location.href = '/motivazionale'; 
            }
        });
    </script>
</body>
</html>`;

    res.send(htmlPage);
}

module.exports = {
    getMotivationalQuote,
    getQuoteOnly,
    handleMotivationalRequest
};
