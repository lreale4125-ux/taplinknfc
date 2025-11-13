// --- src/services/motivational.js ---

// ... (il resto del codice rimane uguale fino alla funzione handleMotivationalRequest)

async function handleMotivationalRequest(req, res) {
    const initialTopic = req.query.topic || 'motivazione';
    
    // HTML della pagina motivazionale CON HEADER
    const htmlPage = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Frase Motivazionale</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #f3e8e8 0%, #e8f3f3 100%); color: #333; display: flex; flex-direction: column; min-height: 100vh; justify-content: space-between; line-height: 1.6; }
        
        /* HEADER STYLES */
        .auth-header { background: rgba(255, 255, 255, 0.95); padding: 15px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; }
        .auth-header .user-info { display: flex; align-items: center; gap: 15px; }
        .auth-header .username { font-weight: 600; color: #2c3e50; }
        .auth-header .auth-btn { background: linear-gradient(135deg, #caaeb3 0%, #b49499 100%); color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-weight: 600; transition: all 0.3s ease; text-decoration: none; font-size: 0.9rem; }
        .auth-header .auth-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
        
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
    <!-- HEADER CON LOGIN/LOGOUT -->
    <header class="auth-header" id="auth-header">
        <div class="logo">Motivazional</div>
        <div class="user-info">
            <span class="username" id="username-display">Ospite</span>
            <a href="https://taplinknfc.it/login?redirect=motivazional" class="auth-btn" id="auth-button">Login</a>
        </div>
    </header>

    <header class="header">
        <h1>365 giorni per una versione più felice di te</h1>
        <p>Consigli e ispirazioni per vivere al meglio la tua vita</p>
    </header>
    <main>
        <h2>Scopri una frase su <span id="topic-text">${initialTopic}</span></h2>
        <div id="quote-text">Caricamento della tua motivazione...</div>
    </main>
    <div class="bottom-bar">
        <button id="change-topic-btn">CAMBIA ARGOMENTO</button>
    </div>
    <script>
        // 🎯 GESTIONE STATO AUTENTICAZIONE
        function updateAuthUI() {
            const token = localStorage.getItem('authToken');
            const userData = JSON.parse(localStorage.getItem('userData'));
            const authHeader = document.getElementById('auth-header');
            const usernameDisplay = document.getElementById('username-display');
            const authButton = document.getElementById('auth-button');

            if (token && userData && userData.username) {
                // Utente loggato
                usernameDisplay.textContent = userData.username;
                authButton.textContent = 'Logout';
                authButton.href = '#';
                authButton.onclick = handleLogout;
            } else {
                // Utente non loggato
                usernameDisplay.textContent = 'Ospite';
                authButton.textContent = 'Login';
                authButton.href = 'https://taplinknfc.it/login?redirect=motivazional';
                authButton.onclick = null;
            }
        }

        function handleLogout(e) {
            e.preventDefault();
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            localStorage.removeItem('lastTopic');
            window.location.href = '/motivazionale'; // Ricarica la pagina
        }

        // 🎯 GESTIONE LOGIN AUTOMATICO DA URL PARAMETERS
        function checkUrlForAuth() {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const id = urlParams.get('id');
            const topic = urlParams.get('topic');

            if (token && id) {
                try {
                    // Decodifica il token per ottenere i dati utente
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    localStorage.setItem('authToken', token);
                    localStorage.setItem('userData', JSON.stringify(payload));
                    
                    // Salva il topic se fornito
                    if (topic) {
                        localStorage.setItem('lastTopic', topic);
                    }
                    
                    // Pulisci l'URL dai parametri di autenticazione
                    window.history.replaceState({}, document.title, '/motivazionale');
                    
                    // Aggiorna UI e ricarica la frase
                    updateAuthUI();
                    loadQuote();
                } catch (error) {
                    console.error('Errore durante il login automatico:', error);
                }
            }
        }

        // 🎯 LOGICA CARICAMENTO FRASE (aggiornata)
        const loadQuote = async () => {
            const token = localStorage.getItem('authToken');
            const userData = JSON.parse(localStorage.getItem('userData'));
            const savedTopic = localStorage.getItem('lastTopic');

            // 1. Definisci USERNAME e TOPIC in base alla sessione
            const isUserLoggedIn = token && userData && userData.username;
            const username = isUserLoggedIn ? userData.username : 'Ospite';
            const keychainId = isUserLoggedIn ? userData.id : 'Ospite';
            const topic = savedTopic || '${initialTopic}';
            
            // Aggiorna il testo del topic visualizzato
            document.getElementById('topic-text').innerText = topic;

            try {
                const headers = {};
                if (token) {
                    headers['Authorization'] = 'Bearer ' + token;
                }
                
                const url = '/api/quote?' + 
                    'id=' + encodeURIComponent(keychainId) + 
                    '&username=' + encodeURIComponent(username) + 
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

        // 🎯 INIZIALIZZAZIONE
        document.addEventListener('DOMContentLoaded', function() {
            checkUrlForAuth(); // Controlla se siamo stati reindirizzati dal login
            updateAuthUI();    // Aggiorna l'header
            loadQuote();       // Carica la frase motivazionale

            // Gestione cambio topic
            document.getElementById('change-topic-btn').addEventListener('click', () => {
                const topicTextElement = document.getElementById('topic-text');
                const currentTopic = topicTextElement.innerText;

                const newTopic = prompt("Inserisci un nuovo argomento:", currentTopic) || currentTopic;
                
                if (newTopic && newTopic !== currentTopic) {
                    localStorage.setItem('lastTopic', newTopic);
                    window.location.href = '/motivazionale'; 
                }
            });
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
