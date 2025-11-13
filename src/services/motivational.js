// --- src/services/motivational.js ---

const db = require('../db');

/**
 * Prende una frase motivazionale casuale dal database N8N
 * @param {string} topic - Categoria della frase
 * @param {string} userName - Nome utente per personalizzare
 * @returns {Promise<string>}
 */
async function getMotivationalQuoteFromN8N(topic = 'motivazione', userName = '') {
    try {
        // Cerca frasi per la categoria specificata
        const phrases = db.prepare(`
            SELECT phrase_text, category 
            FROM motivational_phrases 
            WHERE category = ? 
            ORDER BY RANDOM() 
            LIMIT 1
        `).all(topic);

        if (phrases.length > 0) {
            let phrase = phrases[0].phrase_text;
            
            // Personalizza la frase con il nome utente se presente
            if (userName && userName !== 'Ospite' && userName !== 'Utente') {
                phrase = phrase.replace(/\[nome\]/gi, userName);
                phrase = phrase.replace(/l'utente/gi, userName);
            }
            
            return phrase;
        } else {
            // Fallback se non trova frasi per la categoria
            const fallbackPhrases = db.prepare(`
                SELECT phrase_text 
                FROM motivational_phrases 
                WHERE category = 'generale' 
                ORDER BY RANDOM() 
                LIMIT 1
            `).all();

            if (fallbackPhrases.length > 0) {
                return fallbackPhrases[0].phrase_text;
            } else {
                return "La motivazione è dentro di te, non smettere di cercarla.";
            }
        }
    } catch (error) {
        console.error("Errore nel recupero frase da database:", error);
        return "La motivazione è dentro di te, non smettere di cercarla.";
    }
}

/**
 * Endpoint API aggiornato per usare il database N8N
 */
async function getQuoteOnly(req, res) {
    try {
        res.setHeader('Content-Type', 'application/json');
        
        let keychainId = req.query.id || 'Ospite';
        let topic = req.query.topic || 'motivazione';
        let username = req.query.username || keychainId; 
        
        // Logica autenticazione (mantenuta uguale)
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            const token = req.headers.authorization.split(' ')[1];
            try {
                const jwt = require('jsonwebtoken');
                const user = jwt.verify(token, process.env.JWT_SECRET);
                keychainId = user.id || keychainId;
                username = user.username || user.name || user.email || user.id || username;
            } catch (err) {
                console.warn('Token non valido. Accesso come Ospite.');
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
            console.error("Errore DB analytics:", dbError.message);
        }

        // 🎯 USA IL DATABASE N8N invece di Gemini
        const quote = await getMotivationalQuoteFromN8N(topic, username); 
        res.json({ quote });
        
    } catch (error) {
        console.error("Errore in getQuoteOnly:", error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
}
/**
 * Salva/aggiorna il nickname per un utente
 */
async function updateUserNickname(req, res) {
    try {
        res.setHeader('Content-Type', 'application/json');
        
        const { nickname } = req.body;
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Token mancante' });
        }
        
        const user = jwt.verify(token, process.env.JWT_SECRET);
        const userId = user.id;
        
        try {
            db.prepare(`
                INSERT OR REPLACE INTO user_profiles (user_id, nickname, updated_at)
                VALUES (?, ?, datetime('now'))
            `).run(userId, nickname);
        } catch (dbError) {
            console.error("Errore DB nel salvataggio nickname:", dbError.message);
        }
        
        res.json({ success: true, message: 'Nickname salvato' });
        
    } catch (error) {
        console.error("Errore salvataggio nickname:", error);
        res.status(500).json({ error: 'Errore nel salvataggio' });
    }
}

/**
 * Gestisce la richiesta della pagina motivazionale con HTML + fetch lato client.
 */
async function handleMotivationalRequest(req, res) {
    try {
        const initialTopic = req.query.topic || 'motivazione';
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        
        const htmlPage = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Frase Motivazionale</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #f3e8e8 0%, #e8f3f3 100%); color: #333; display: flex; flex-direction: column; min-height: 100vh; justify-content: space-between; line-height: 1.6; }
        
        .auth-header { background: rgba(255, 255, 255, 0.95); padding: 15px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; }
        .auth-header .user-info { display: flex; align-items: center; gap: 15px; }
        .auth-header .username { font-weight: 600; color: #2c3e50; }
        .auth-header .auth-btn { background: linear-gradient(135deg, #caaeb3 0%, #b49499 100%); color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-weight: 600; transition: all 0.3s ease; text-decoration: none; font-size: 0.9rem; }
        .auth-header .auth-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
        
        .nickname-popup { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .nickname-popup-content { background: white; padding: 30px; border-radius: 15px; text-align: center; max-width: 400px; width: 90%; }
        .nickname-popup h2 { color: #2c3e50; margin-bottom: 15px; }
        .nickname-popup p { margin-bottom: 20px; color: #555; }
        .nickname-input { width: 100%; padding: 12px; border: 2px solid #caaeb3; border-radius: 8px; font-size: 16px; margin-bottom: 20px; }
        .nickname-btn { background: linear-gradient(135deg, #caaeb3 0%, #b49499 100%); color: white; border: none; padding: 12px 30px; border-radius: 25px; font-size: 16px; cursor: pointer; }
        
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
        function updateAuthUI() {
            const token = localStorage.getItem('authToken');
            const userData = JSON.parse(localStorage.getItem('userData'));
            const usernameDisplay = document.getElementById('username-display');
            const authButton = document.getElementById('auth-button');

            if (token && userData) {
                const displayName = userData.username || userData.name || userData.email || userData.id || 'Utente';
                usernameDisplay.textContent = displayName;
                authButton.textContent = 'Logout';
                authButton.href = '#';
                authButton.onclick = handleLogout;
            } else {
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
            localStorage.removeItem('nicknameSet');
            sessionStorage.clear();
            window.location.replace('https://taplinknfc.it');
        }

        function showNicknamePopup() {
            const popup = document.createElement('div');
            popup.className = 'nickname-popup';
            popup.innerHTML = \`
                <div class="nickname-popup-content">
                    <h2>Benvenuto! 👋</h2>
                    <p>Scegli un nickname per personalizzare la tua esperienza:</p>
                    <input type="text" id="nickname-input" placeholder="Il tuo nickname..." class="nickname-input" maxlength="20">
                    <button id="save-nickname" class="nickname-btn">Salva e Continua</button>
                </div>
            \`;
            document.body.appendChild(popup);
            
            const input = document.getElementById('nickname-input');
            input.focus();
            
            document.getElementById('save-nickname').addEventListener('click', function() {
                const nickname = input.value.trim();
                if (nickname.length < 2) {
                    alert('Inserisci un nickname di almeno 2 caratteri');
                    return;
                }
                if (nickname.length > 20) {
                    alert('Il nickname non può superare i 20 caratteri');
                    return;
                }
                
                const userData = JSON.parse(localStorage.getItem('userData'));
                userData.username = nickname;
                localStorage.setItem('userData', JSON.stringify(userData));
                localStorage.setItem('nicknameSet', 'true');
                
                const token = localStorage.getItem('authToken');
                if (token) {
                    fetch('/api/update-nickname', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify({ nickname: nickname })
                    }).catch(err => console.error('Errore salvataggio nickname:', err));
                }
                
                document.body.removeChild(popup);
                const urlParams = new URLSearchParams(window.location.search);
                const topic = urlParams.get('topic');
                if (topic) localStorage.setItem('lastTopic', topic);
                window.history.replaceState({}, document.title, '/motivazionale');
                updateAuthUI();
                loadQuote();
            });
            
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') document.getElementById('save-nickname').click();
            });
        }

        function checkUrlForAuth() {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const id = urlParams.get('id');
            const topic = urlParams.get('topic');

            if (token && id) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    localStorage.setItem('authToken', token);
                    localStorage.setItem('userData', JSON.stringify(payload));
                    
                    const hasRealName = payload.username || payload.name;
                    const displayName = payload.username || payload.name || payload.email || payload.id;
                    const isGoogleUser = payload.provider === 'google' || displayName === 'Google User' || !hasRealName;
                    
                    if (isGoogleUser && !localStorage.getItem('nicknameSet')) {
                        showNicknamePopup();
                    } else {
                        if (topic) localStorage.setItem('lastTopic', topic);
                        window.history.replaceState({}, document.title, '/motivazionale');
                        updateAuthUI();
                        loadQuote();
                    }
                } catch (error) {
                    console.error('Errore durante il login automatico:', error);
                }
            }
        }

        const loadQuote = async () => {
            const token = localStorage.getItem('authToken');
            const userData = JSON.parse(localStorage.getItem('userData'));
            const savedTopic = localStorage.getItem('lastTopic');

            let username = 'Ospite';
            let keychainId = 'Ospite';
            
            if (token && userData) {
                keychainId = userData.id || 'Ospite';
                username = userData.username || userData.name || userData.email || userData.id || 'Utente';
            }
            
            const topic = savedTopic || '${initialTopic}';
            document.getElementById('topic-text').innerText = topic;

            try {
                const headers = {};
                if (token) headers['Authorization'] = 'Bearer ' + token;
                
                const url = '/api/quote?id=' + encodeURIComponent(keychainId) + '&username=' + encodeURIComponent(username) + '&topic=' + encodeURIComponent(topic);
                const response = await fetch(url, { headers });
                if (!response.ok) throw new Error('Server non OK: ' + response.status);
                
                const data = await response.json();
                document.getElementById('quote-text').innerText = '"' + data.quote + '"';
            } catch (e) {
                console.error("Errore caricamento frase:", e);
                document.getElementById('quote-text').innerText = ':( La motivazione è dentro di te, non smettere di cercarla.';
            }
        };

        document.addEventListener('DOMContentLoaded', function() {
            checkUrlForAuth();
            updateAuthUI();
            
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
    } catch (error) {
        console.error("Errore in handleMotivationalRequest:", error);
        res.status(500).send("Errore nel caricamento della pagina");
    }
}

module.exports = {
    getMotivationalQuote,
    getQuoteOnly,
    handleMotivationalRequest,
    updateUserNickname
};
