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
            let author = phrases[0].author || 'Anonimo';

            // Personalizza la frase con il nome utente
            if (userName && userName !== 'Ospite' && userName !== 'Utente') {
                phrase = phrase.replace(/\[nome\]/gi, userName);
                phrase = phrase.replace(/l'utente/gi, userName);
            }

            return { quote: phrase, author: author };
        } else {
            // Fallback
            const fallbackPhrases = db.prepare(`
                SELECT phrase_text, author
                FROM motivational_phrases
                ORDER BY RANDOM()
                LIMIT 1
            `).all();

            if (fallbackPhrases.length > 0) {
                let phrase = fallbackPhrases[0].phrase_text;
                let author = fallbackPhrases[0].author || 'Anonimo';
                return { quote: phrase, author: author };
            } else {
                return { quote: "La motivazione è dentro di te, non smettere di cercarla.", author: "Anonimo" };
            }
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
        const result = await getMotivationalQuoteFromDB(topic, userName);

        console.log(`✅ Frase da N8N ottenuta: ${result.quote.substring(0, 50)}...`);
        return result;

    } catch (error) {
        console.error("❌ Errore in getMotivationalQuoteFromN8N:", error);
        return { quote: "La motivazione viene da dentro di te. Continua a crederci!", author: "Anonimo" };
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

        const result = await getMotivationalQuoteFromN8N(topic, username);
        res.json(result);
        
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
        /* Removed animations for clean, modern look */

        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding-bottom: 80px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 50%, #ff9a9e 100%);
            background-attachment: fixed;
            color: #333;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            justify-content: space-between;
            line-height: 1.6;
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
        }

        .topic-popup-content {
            background: #ffffff;
            padding: 30px;
            border-radius: 25px;
            text-align: center;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
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
            background: #f8f9fa;
            color: #333;
            border: none;
            padding: 15px;
            border-radius: 15px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s ease;
            touch-action: manipulation;
        }

        .topic-option:hover {
            background: #e9ecef;
        }

        .close-popup {
            background: #6c757d;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 600;
            touch-action: manipulation;
            transition: background-color 0.3s ease;
        }

        .close-popup:hover {
            background: #5a6268;
        }

        .auth-header {
            background: rgba(255,255,255,0.95);
            padding: 15px 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .auth-header .logo {
            font-weight: 700;
            font-size: 1.2rem;
            color: #333;
        }
        .auth-header .user-info { display: flex; align-items: center; gap: 15px; }
        .auth-header .username {
            font-weight: 600;
            color: #333;
        }
        .auth-header .auth-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 600;
            text-decoration: none;
            font-size: 0.9rem;
            touch-action: manipulation;
        }
        .auth-header .auth-btn:hover {
            background: #0056b3;
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
        }
        .nickname-popup-content {
            background: #ffffff;
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
            border: 2px solid #fcb69f;
            border-radius: 10px;
            font-size: 16px;
            margin-bottom: 20px;
            transition: border-color 0.3s ease;
        }
        .nickname-input:focus { border-color: #ff9a9e; outline: none; }
        .nickname-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            font-size: 16px;
            cursor: pointer;
            touch-action: manipulation;
            transition: background-color 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .nickname-btn:hover {
            background: #0056b3;
        }

        .header {
            background: #fcb69f;
            border-radius: 20px;
            margin: 20px;
            margin-bottom: 10px;
            padding: 30px 20px;
            max-width: 500px;
            align-self: center;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .header h1 {
            font-weight: 700;
            font-size: 1.8rem;
            margin: 0 0 15px 0;
            line-height: 1.3;
            color: #fff;
        }
        .header p {
            font-weight: 400;
            font-size: 1rem;
            margin: 0;
            color: #fff;
        }

        main {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            max-width: 600px;
            margin: 0 auto;
            text-align: center;
        }
        main h2 {
            font-weight: 600;
            font-size: 1.4rem;
            margin: 10px 0 15px 0;
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
            font-size: 2.2rem;
            font-weight: 400;
            min-height: 100px;
            color: #34495e;
            line-height: 1.5;
            font-style: italic;
            background: rgba(255,255,255,0.95);
            padding: 40px 30px;
            border-radius: 20px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            position: relative;
            max-width: 600px;
            text-align: center;
        }
        #quote-text::before {
            content: '"';
            position: absolute;
            top: -10px;
            left: 15px;
            font-size: 3rem;
            color: #fcb69f;
            font-family: serif;
            opacity: 0.5;
        }
        #quote-text::after {
            content: '"';
            position: absolute;
            bottom: -30px;
            right: 15px;
            font-size: 3rem;
            color: #fcb69f;
            font-family: serif;
            opacity: 0.5;
        }

        button, .icon-button {
            cursor: pointer;
            border: none;
            border-radius: 25px;
            padding: 12px 25px;
            font-weight: 600;
            font-size: 1rem;
            user-select: none;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            min-height: 44px;
            touch-action: manipulation;
        }
        button {
            background: #007bff;
            color: #fff;
        }
        button:hover {
            background: #0056b3;
        }

        /* --- TABLET --- */
        @media (min-width: 769px) and (max-width: 1024px) {
            .header {
                max-width: 600px;
                padding: 40px 25px;
                margin-bottom: 10px;
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
                margin: 10px 0 15px 0;
            }
            #quote-text {
                font-size: 1.8rem;
                padding: 35px 25px;
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
                margin-bottom: 10px;
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
                margin: 10px 0 15px 0;
            }
            #quote-text {
                font-size: 2rem;
                padding: 40px 30px;
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
                padding-bottom: 40px;
                margin: 0;
                background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
            }

            .auth-header { padding: 5px 10px; }
            .auth-header .auth-btn { font-size: 0.8rem; padding: 4px 8px; }

            .header {
                margin: 5px;
                margin-bottom: 2px;
                padding: 15px 10px;
            }

            .header h1 {
                font-size: 1.3rem;
            }

            .header p {
                font-size: 0.8rem;
            }

            main {
                padding: 5px;
                max-width: 100%;
                margin: 0;
                gap: 5px;
            }

            main h2 {
                font-size: 1.1rem;
                margin: 2px 0 0 0;
            }

            #quote-text {
                font-size: 1.4rem;
                padding: 20px 15px;
                min-height: auto;
                margin-top: 5px;
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

            #change-topic-btn {
                bottom: 10px;
                left: 50%;
                transform: translateX(-50%);
                padding: 8px 12px;
                font-size: 0.8rem;
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

        <!-- 🎮 PULSANTE PER INDOVINARE L'AUTORE -->
        <button id="guess-author-btn" style="background: #007bff; color: #fff; border: none; padding: 12px 25px; border-radius: 25px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 20px; transition: background-color 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">🎯 Indovina l'autore!</button>
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

    <!-- 🎮 POPUP PER INDOVINARE L'AUTORE -->
    <div class="topic-popup" id="author-popup" style="display: none;">
        <div class="topic-popup-content">
            <h3>🎯 Indovina l'autore della frase!</h3>
            <input type="text" id="author-guess" placeholder="Chi ha detto questa frase?" class="nickname-input" maxlength="50">
            <button id="check-guess" class="nickname-btn">Verifica Risposta</button>
            <div id="game-feedback" style="margin-top: 20px; font-size: 1.1rem; font-weight: 600; min-height: 30px;"></div>
            <button class="close-popup" id="close-author-popup">Chiudi</button>
        </div>
    </div>

    <!-- Pulsante fluttuante per cambiare argomento -->
    <button id="change-topic-btn" style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; background: white; color: black; font-weight: bold; border: none; padding: 12px 20px; border-radius: 10px; font-size: 0.9rem; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">Cambia argomento</button>
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

        let correctAuthor = 'Anonimo'; // Variabile globale per l'autore corretto

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
                correctAuthor = data.author || 'Anonimo';

                // Il gioco è ora in popup, attivato dal pulsante
            } catch (e) {
                console.error("Errore caricamento frase:", e);
                document.getElementById('quote-text').innerText = ':( La motivazione è dentro di te, non smettere di cercarla.';
                correctAuthor = 'Anonimo';
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

                // 🎮 LOGICA GIOCO INDOVINA AUTORE
                document.getElementById('check-guess').addEventListener('click', function() {
                    const guess = document.getElementById('author-guess').value.trim().toLowerCase();
                    const correct = correctAuthor.toLowerCase();
                    const feedback = document.getElementById('game-feedback');

                    if (guess === '') {
                        feedback.innerHTML = "<span style='color: #ff9a9e;'>Inserisci un nome per indovinare!</span>";
                        return;
                    }

                    if (guess === correct) {
                        feedback.innerHTML = "<span style='color: #4CAF50;'>🎉 Corretto! L'autore è " + correctAuthor + ".</span>";
                    } else {
                        feedback.innerHTML = "<span style='color: #ff9a9e;'>❌ Sbagliato! L'autore è " + correctAuthor + ".</span>";
                    }
                });

                // Permetti invio con Enter
                document.getElementById('author-guess').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        document.getElementById('check-guess').click();
                    }
                });

                // 🔥 PULSANTE PER APRIRE POPUP AUTORE
                document.getElementById('guess-author-btn').addEventListener('click', () => {
                    document.getElementById('author-popup').style.display = 'flex';
                    document.getElementById('author-guess').value = '';
                    document.getElementById('game-feedback').innerHTML = '';
                    document.getElementById('author-guess').focus();
                });

                // 🔥 CHIUDI POPUP AUTORE
                document.getElementById('close-author-popup').addEventListener('click', () => {
                    document.getElementById('author-popup').style.display = 'none';
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
