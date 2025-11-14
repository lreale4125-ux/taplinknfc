// --- src/services/motivational.js ---

const db = require('../db');
const jwt = require('jsonwebtoken');

/**
 * Mappa le categorie N8N alle categorie del sito
 */
function mapCategory(n8nCategory) {
    const categoryMap = {
        'motivazione_personale': 'motivazione',
        'studio_apprendimento': 'studio', 
        'successo_resilienza': 'successo'
    };
    return categoryMap[n8nCategory] || 'motivazione';
}

/**
 * Prende una frase motivazionale casuale dal database
 */
async function getMotivationalQuoteFromDB(topic = 'motivazione_personale', userName = '') {
    try {
        // Usa direttamente le categorie N8N
        const mappedTopic = topic; // Non mappiamo più, usiamo direttamente
        
        const phrases = db.prepare(`
            SELECT phrase_text, category, author
            FROM motivational_phrases 
            WHERE category = ? 
            ORDER BY RANDOM() 
            LIMIT 1
        `).all(mappedTopic);

        if (phrases.length > 0) {
            let phrase = phrases[0].phrase_text;
            
            // Personalizza la frase con il nome utente
            if (userName && userName !== 'Ospite' && userName !== 'Utente') {
                phrase = phrase.replace(/\[nome\]/gi, userName);
                phrase = phrase.replace(/l'utente/gi, userName);
            }
            
            return phrase;
        } else {
            // Fallback
            const fallbackPhrases = db.prepare(`
                SELECT phrase_text 
                FROM motivational_phrases 
                ORDER BY RANDOM() 
                LIMIT 1
            `).all();

            return fallbackPhrases.length > 0 
                ? fallbackPhrases[0].phrase_text 
                : "La motivazione è dentro di te, non smettere di cercarla.";
        }
    } catch (error) {
        console.error("Errore nel recupero frase da database:", error);
        return "La motivazione è dentro di te, non smettere di cercarla.";
    }
}

/**
 * 🆕 FUNZIONE AGGIUNTA - Risolve l'errore "getMotivationalQuoteFromN8N is not defined"
 */
async function getMotivationalQuoteFromN8N(topic = 'motivazione', userName = '') {
    try {
        console.log(`📝 Richiesta frase da N8N - Topic: ${topic}, User: ${userName}`);
        
        // Usa la stessa logica del database per ora
        // In futuro puoi integrare con chiamate dirette a N8N
        const quote = await getMotivationalQuoteFromDB(topic, userName);
        
        console.log(`✅ Frase da N8N ottenuta: ${quote.substring(0, 50)}...`);
        return quote;
        
    } catch (error) {
        console.error("❌ Errore in getMotivationalQuoteFromN8N:", error);
        return "La motivazione viene da dentro di te. Continua a crederci!";
    }
}

/**
 * Endpoint API che usa il database
 */
async function getQuoteOnly(req, res) {
    try {
        res.setHeader('Content-Type', 'application/json');
        
        let keychainId = req.query.id || 'Ospite';
        let topic = req.query.topic || 'motivazione_personale'; 
        let username = req.query.username || keychainId; 
        
        // Autenticazione
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            const token = req.headers.authorization.split(' ')[1];
            try {
                const user = jwt.verify(token, process.env.JWT_SECRET);
                keychainId = user.id || keychainId;
                username = user.username || user.name || user.email || user.id || username;
            } catch (err) {
                console.warn('Token non valido. Accesso come Ospite.');
            }
        }
        
        // Analytics
        try {
            db.prepare(`
                INSERT INTO motivational_analytics (keychain_id, topic, view_count)
                VALUES (?, ?, 1)
                ON CONFLICT(keychain_id, topic) DO UPDATE SET view_count = view_count + 1
            `).run(keychainId, topic);
        } catch (dbError) {
            console.error("Errore DB analytics:", dbError.message);
        }

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
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }

        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding-bottom: 80px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            background-attachment: fixed;
            color: #333;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            justify-content: space-between;
            line-height: 1.6;
            animation: fadeIn 1s ease-out;
        }

        /* 🔥 POPUP ARGOMENTI */
        .topic-popup {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.3s ease-out;
        }

        .topic-popup-content {
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            padding: 30px;
            border-radius: 25px;
            text-align: center;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.2);
        }

        .topic-popup h3 {
            color: #2c3e50;
            margin-bottom: 25px;
            font-size: 1.4rem;
            font-weight: 700;
        }

        .topic-options {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 20px;
        }

        .topic-option {
            background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%);
            color: white;
            border: none;
            padding: 15px;
            border-radius: 15px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            touch-action: manipulation;
            position: relative;
            overflow: hidden;
        }

        .topic-option::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }

        .topic-option:hover::before {
            left: 100%;
        }

        .topic-option:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(255,154,158,0.4);
        }

        .close-popup {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            color: #2c3e50;
            border: none;
            padding: 10px 20px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 600;
            touch-action: manipulation;
            transition: all 0.3s ease;
        }

        .close-popup:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 15px rgba(168,237,234,0.4);
        }

        .auth-header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 15px 20px;
            box-shadow: 0 2px 20px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255,255,255,0.2);
        }
        .auth-header .user-info { display: flex; align-items: center; gap: 15px; }
        .auth-header .username { font-weight: 600; color: #2c3e50; }
        .auth-header .auth-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            text-decoration: none;
            font-size: 0.9rem;
            touch-action: manipulation;
            box-shadow: 0 4px 15px rgba(102,126,234,0.3);
        }
        .auth-header .auth-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102,126,234,0.4);
        }

        .nickname-popup {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(5px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.3s ease-out;
        }
        .nickname-popup-content {
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            padding: 30px;
            border-radius: 20px;
            text-align: center;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .nickname-popup h2 { color: #2c3e50; margin-bottom: 15px; font-weight: 700; }
        .nickname-popup p { margin-bottom: 20px; color: #555; }
        .nickname-input {
            width: 100%;
            padding: 12px;
            border: 2px solid #667eea;
            border-radius: 10px;
            font-size: 16px;
            margin-bottom: 20px;
            transition: border-color 0.3s ease;
        }
        .nickname-input:focus { border-color: #764ba2; outline: none; }
        .nickname-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            font-size: 16px;
            cursor: pointer;
            touch-action: manipulation;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(102,126,234,0.3);
        }
        .nickname-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102,126,234,0.4);
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            border-radius: 30px;
            margin: 20px;
            padding: 30px 20px;
            max-width: 500px;
            align-self: center;
            box-shadow: 0 8px 30px rgba(102,126,234,0.3);
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 4s infinite;
        }
        .header h1 {
            font-weight: 700;
            font-size: 1.8rem;
            margin: 0 0 15px 0;
            line-height: 1.3;
            color: #fff;
            position: relative;
            z-index: 1;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .header p {
            font-weight: 400;
            font-size: 1rem;
            margin: 0;
            opacity: 0.9;
            color: #fff;
            position: relative;
            z-index: 1;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }

        main {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px;
            max-width: 500px;
            margin: 0 auto;
            text-align: center;
        }
        main h2 {
            font-weight: 600;
            font-size: 1.4rem;
            margin: 20px 0 15px 0;
            color: #fff;
            text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        main span {
            font-weight: 700;
            color: #ffd700;
            text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        #quote-text {
            margin-top: 20px;
            font-size: 1.2rem;
            font-weight: 400;
            min-height: 80px;
            color: #34495e;
            line-height: 1.5;
            font-style: italic;
            background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,249,250,0.95) 100%);
            padding: 25px 20px;
            border-radius: 20px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            position: relative;
            animation: fadeIn 0.8s ease-out 0.3s both;
        }
        #quote-text::before {
            content: '"';
            position: absolute;
            top: -10px;
            left: 15px;
            font-size: 3rem;
            color: #667eea;
            font-family: serif;
            opacity: 0.3;
        }
        #quote-text::after {
            content: '"';
            position: absolute;
            bottom: -30px;
            right: 15px;
            font-size: 3rem;
            color: #667eea;
            font-family: serif;
            opacity: 0.3;
        }

        .bottom-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 10px;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
            z-index: 999;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
            border-top: 1px solid rgba(255,255,255,0.2);
        }
        button, .icon-button {
            cursor: pointer;
            border: none;
            border-radius: 25px;
            padding: 12px 25px;
            font-weight: 600;
            font-size: 1rem;
            user-select: none;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(102,126,234,0.3);
            min-height: 44px;
            touch-action: manipulation;
            position: relative;
            overflow: hidden;
        }
        button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }
        button:hover::before {
            left: 100%;
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102,126,234,0.4);
        }

        /* --- TABLET --- */
        @media (min-width: 769px) and (max-width: 1024px) {
            .header {
                max-width: 600px;
                padding: 40px 25px;
            }
            .header h1 {
                font-size: 2rem;
            }
            .header p {
                font-size: 1.1rem;
            }
            main {
                max-width: 600px;
                padding: 25px;
            }
            main h2 {
                font-size: 1.5rem;
            }
            #quote-text {
                font-size: 1.3rem;
                padding: 30px 25px;
            }
            .bottom-bar button {
                font-size: 1.1rem;
                padding: 14px 30px;
            }
            .topic-popup-content {
                max-width: 450px;
            }
            .topic-option {
                padding: 16px;
                font-size: 1.05rem;
            }
        }

        /* --- DESKTOP --- */
        @media (min-width: 1025px) {
            .header {
                max-width: 700px;
                padding: 50px 30px;
            }
            .header h1 {
                font-size: 2.2rem;
            }
            .header p {
                font-size: 1.2rem;
            }
            main {
                max-width: 700px;
                padding: 30px;
            }
            main h2 {
                font-size: 1.6rem;
            }
            #quote-text {
                font-size: 1.4rem;
                padding: 35px 30px;
            }
            .bottom-bar button {
                font-size: 1.2rem;
                padding: 16px 35px;
            }
            .topic-popup-content {
                max-width: 500px;
            }
            .topic-option {
                padding: 18px;
                font-size: 1.1rem;
            }
        }

        /* --- VERSIONE COMPATTA MOBILE --- */
        @media (max-width: 768px) {
            body {
                padding: 0;
                padding-bottom: 80px;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }

            .auth-header { padding: 10px 15px; }
            .auth-header .auth-btn { font-size: 0.8rem; padding: 6px 12px; }

            .header {
                margin: 10px;
                padding: 20px 15px;
            }

            .header h1 {
                font-size: 1.4rem;
            }

            .header p {
                font-size: 0.9rem;
            }

            main {
                padding: 10px;
                max-width: 100%;
                margin: 0;
                gap: 10px;
            }

            main h2 {
                font-size: 1.2rem;
                margin: 10px 0 0 0;
            }

            #quote-text {
                font-size: 1rem;
                padding: 20px 15px;
                min-height: auto;
                margin-top: 10px;
            }

            .bottom-bar {
                display: flex;
                justify-content: center;
                width: 100%;
                padding: 10px;
            }

            .bottom-bar button {
                width: 100%;
                padding: 12px;
                font-size: 1.05rem;
                border-radius: 20px;
            }

            .topic-popup-content {
                padding: 20px;
                max-width: 85%;
            }

            .topic-option {
                padding: 12px;
                font-size: 0.95rem;
            }
        }
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
    <!-- 🔥 POPUP PER CAMBIARE ARGOMENTO -->
    <div class="topic-popup" id="topic-popup" style="display: none;">
        <div class="topic-popup-content">
            <h3>Scegli un argomento</h3>
            <div class="topic-options">
                <button class="topic-option" data-topic="motivazione">🌟 Motivazione Personale</button>
                <button class="topic-option" data-topic="studio">📚 Studio & Apprendimento</button>
                <button class="topic-option" data-topic="successo">💪 Successo & Resilienza</button>
            </div>
            <button class="close-popup" id="close-popup">Chiudi</button>
        </div>
    </div>

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
        
            // 🔥 SE C'È UN TOKEN NELL'URL (login appena fatto)
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
                        // Aspetta che l'utente inserisca il nickname prima di caricare la frase
                    } else {
                        if (topic) localStorage.setItem('lastTopic', topic);
                        window.history.replaceState({}, document.title, '/motivazionale');
                        updateAuthUI();
                        loadQuote(); // Carica la frase dopo il login
                    }
                } catch (error) {
                    console.error('Errore durante il login automatico:', error);
                    loadQuote(); // Carica comunque la frase anche se auth fallisce
                }
            } 
            // 🔥 SE NON C'È TOKEN NELL'URL MA C'È IN LOCALSTORAGE (pagina ricaricata)
            else if (localStorage.getItem('authToken')) {
                // L'utente è già loggato, carica semplicemente la frase
                updateAuthUI();
                loadQuote();
            }
            // 🔥 SE NON C'È ALCUN LOGIN (utente ospite)
            else {
                updateAuthUI();
                loadQuote(); // Carica la frase per ospite
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
                
                // 🔥 BOTTONE PER APRIRE POPUP ARGOMENTI
                document.getElementById('change-topic-btn').addEventListener('click', () => {
                    document.getElementById('topic-popup').style.display = 'flex';
                });
                
                // 🔥 CHIUDI POPUP
                document.getElementById('close-popup').addEventListener('click', () => {
                    document.getElementById('topic-popup').style.display = 'none';
                });
                
                // 🔥 SELEZIONE ARGOMENTO
                document.querySelectorAll('.topic-option').forEach(button => {
                    button.addEventListener('click', function() {
                        const selectedTopic = this.getAttribute('data-topic');
                        
                        // Aggiorna il testo nella pagina
                        document.getElementById('topic-text').innerText = this.innerText.split(' ')[0]; // Prende solo la prima parola
                        
                        // Salva nel localStorage
                        localStorage.setItem('lastTopic', selectedTopic);
                        
                        // Chiudi il popup
                        document.getElementById('topic-popup').style.display = 'none';
                        
                        // Carica una nuova frase per l'argomento selezionato
                        loadQuote();
                    });
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

// 🎯 FUNZIONE PER COMPATIBILITÀ
async function getMotivationalQuote(userNameOrId, topic = 'motivazione') {
    return await getMotivationalQuoteFromN8N(topic, userNameOrId);
}

module.exports = {
    getMotivationalQuote,  // Per compatibilità
    getMotivationalQuoteFromN8N,  // 🆕 FUNZIONE AGGIUNTA
    getQuoteOnly,
    handleMotivationalRequest,
    updateUserNickname
};
