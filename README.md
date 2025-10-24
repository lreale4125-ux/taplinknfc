# NFC Analytics - Guida al Deployment Full-Stack

Una piattaforma completa di analisi per portachiavi NFC con gestione utenti, controlli di amministrazione e analisi in tempo reale.

## 🚀 Funzionalità

- **Registrazione Aziendale**: Gli utenti si registrano con il nome dell'azienda, creato dinamicamente.
- **Gestione Admin**: Pannello completo per la gestione di utenti, aziende e link.
- **Gestione Saldo**: Sistema di ricarica e addebito "TAP" per utenti.
- **Analisi Real-Time**: Traccia le scansioni dei portachiavi NFC con analisi dettagliate.
- **Generazione QR Code**: Genera automaticamente QR Code (sia `.png` che `.svg`) in cartelle separate, pronti per la stampa e l'automazione 3D.
- **Autenticazione Sicura**: Autenticazione basata su JWT con controllo degli accessi basato sui ruoli.

## 📋 Prerequisiti

- Una VPS con **Ubuntu 22.04+**
- Un **Nome di Dominio** (es. `taplinknfc.it`) puntato all'IP della tua VPS.
- **Node.js 18+**
- **Nginx**
- **PM2** (Process Manager)
- Un account **GitHub** per una repository privata.
- Un **Personal Access Token (PAT)** di GitHub con permessi `repo` (per fare push/clone dalla VPS).

---

## 🚀 Deployment in Produzione (Da una Nuova VPS)

Questa guida copre un deployment pulito da un server nuovo usando un flusso di lavoro basato su Git.

### 1. Backup del Vecchio Server (Se applicabile)

Prima di resettare il tuo vecchio server, fai il backup dei file critici:

1. **Codice Sorgente**  
   Fai il push di tutto il codice su una **repository GitHub privata**.  
   Assicurati che il file `.gitignore` escluda `node_modules/`, `.env`, `.ssh/`, e i file del database (`*.db*`).

2. **Configurazione Nginx**  
   Copia la configurazione del tuo sito Nginx (es. `/etc/nginx/sites-available/taplinknfc`) nella cartella del progetto e fai il push anche di questo file su GitHub.

3. **Database**  
   Scarica in modo sicuro il tuo file `database.db` (e i file `.db-wal` / `.db-shm`) sul tuo PC locale usando `scp`.

4. **File `.env`**  
   Copia il contenuto del tuo file `.env` (password, API key) e salvalo in un posto sicuro sul tuo PC locale.

---

### 2. Setup della Nuova VPS

Dopo aver resettato la VPS, connettiti via SSH:

```bash
# Aggiorna e fai l'upgrade dei pacchetti di sistema
sudo apt update && sudo apt upgrade -y

# Installa Git, Node.js (18.x), npm e Nginx
sudo apt install git nodejs npm nginx -y

# Installa PM2 (Process Manager) globalmente
sudo npm install -g pm2
```

---

### 3. Clona e Installa il Progetto

```bash
# Clona la tua repository privata da GitHub
# Ti chiederà Username e Password (usa il tuo Personal Access Token)
git clone https://github.com/lreale4125-ux/taplinknfc.git

# Entra nella cartella del progetto
cd taplinknfc

# Installa tutte le dipendenze del progetto da package.json
npm install
```

---

### 4. Ripristina i File Critici

Crea il file `.env`:

```bash
nano .env
```

Incolla i tuoi segreti che avevi salvato (vedi la sezione “Configurazione” in fondo).  
Salva e chiudi (`Ctrl+O`, Invio, `Ctrl+X`).

Carica il tuo database dal PC locale alla VPS:

```bash
# Esegui questo dal tuo PC LOCALE
scp C:\percorso\del\tuo\database.db ubuntu@51.75.70.149:/home/ubuntu/taplinknfc/database.db
```

(Carica anche i file `.db-wal` e `.db-shm` se li hai)

---

### 5. Configura Nginx

Usa il file di configurazione Nginx (`taplinknfc`) che hai clonato da GitHub.

```bash
# Copia il file di config del tuo sito nella cartella corretta di Nginx
sudo cp taplinknfc /etc/nginx/sites-available/

# Abilita il tuo sito creando un link simbolico
sudo ln -s /etc/nginx/sites-available/taplinknfc /etc/nginx/sites-enabled/

# Rimuovi il sito di default per evitare conflitti
sudo rm /etc/nginx/sites-enabled/default

# Testa la sintassi della configurazione Nginx
sudo nginx -t
```

(Se questo test fallisce, vedi la sezione “Troubleshooting”)

```bash
# Ricarica Nginx per applicare le modifiche
sudo systemctl reload nginx
```

---

### 6. Configura SSL (Let's Encrypt)

```bash
# Installa Certbot e il suo plugin per Nginx
sudo apt install certbot python3-certbot-nginx -y

# Esegui Certbot per ottenere i certificati SSL
sudo certbot --nginx -d taplinknfc.it -d www.taplinknfc.it -d motivazional.taplinknfc.it
```

Segui le istruzioni a schermo:
1. Inserisci la tua email.  
2. Accetta i termini (Y).  
3. Scegli l’opzione **2 (Redirect)** per forzare HTTPS.  

Certbot aggiornerà automaticamente la configurazione Nginx e ricaricherà il servizio.

---

### 7. Avvia l’Applicazione con PM2

```bash
# Avvia il server backend (entrypoint: src/index.js)
pm2 start src/index.js --name server

# Salva la lista dei processi
pm2 save

# Configura PM2 per avviarsi automaticamente al riavvio
pm2 startup
```

Il tuo sito ora è **live e configurato! 🚀**

---

## 🔄 Come Aggiornare il Progetto (Flusso Git)

Sul tuo PC locale:

```bash
git add .
git commit -m "Aggiornata la homepage"
git push
```

Sulla VPS:

```bash
cd ~/taplinknfc
git pull
```

Se hai modificato file backend:
```bash
pm2 restart server
```

Se hai aggiunto dipendenze:
```bash
npm install && pm2 restart server
```

---

## 🔧 Troubleshooting (Problemi Comuni)

### 🚨 Errore 1 — SSH: *REMOTE HOST IDENTIFICATION HAS CHANGED!*
```bash
ssh-keygen -R 51.75.70.149
```

### 🚨 Errore 2 — `sudo nginx -t` fallisce (SSL)
Commenta le righe SSL nel file `/etc/nginx/sites-available/taplinknfc`, ricarica Nginx e riesegui Certbot.

### 🚨 Errore 3 — 403/500 su Homepage
```bash
sudo chmod 755 /home/ubuntu
sudo chmod -R 755 /home/ubuntu/taplinknfc
```

### 🚨 Errore 4 — API Crash “no such table: users”
Ricarica il vecchio `database.db` e:
```bash
pm2 restart server
```

### 🚨 Errore 5 — 500 Generazione QR Code (EACCES)
```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/taplinknfc/public
pm2 restart server
```

---

## 📁 Struttura Progetto

```
/home/ubuntu/taplinknfc/
├── public/
│   ├── images/
│   │   └── logoAltoTab.png
│   ├── qrcodes/
│   │   ├── qr_png/
│   │   └── qr_svg/
│   ├── admin_panel.html
│   ├── dashboard_utente.html
│   ├── index.html
│   ├── input.css
│   ├── output.css
│   ├── pos.html
│   └── wallet.html
├── src/
│   ├── controllers/
│   │   ├── adminController.js
│   │   ├── authController.js
│   │   └── userController.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── admin.js
│   │   ├── auth.js
│   │   ├── redirects.js
│   │   └── user.js
│   ├── services/
│   │   └── motivational.js
│   ├── utils/
│   │   ├── analytics.js
│   │   └── qrGenerator.js
│   ├── db/
│   └── index.js
├── .env
├── .gitignore
├── database.db
├── deploy.sh
├── package.json
├── package-lock.json
├── README.md
├── server.js
├── taplinknfc
└── tailwind.config.js
```

---

## 🔧 Configurazione `.env`

```
# Variabili di Produzione
NODE_ENV=production
PORT=3001

# JWT Secret (scegline una lunga e casuale)
JWT_SECRET=LaMiaPasswordSegretaSuperLungaECasualePerIl2025

# Percorso database
DATABASE_PATH=./database.db

# Dominio per CORS
CORS_ORIGIN=https://taplinknfc.it

# API Keys
OPENCAGE_API_KEY=392153fd2f3940d6a1daac24cc41a966#
GEMINI_API_KEY=LaTuaChiaveApiGemini

# URL Servizi
MOTIVATIONAL_URL=https://motivazional.taplinknfc.it
```

---

## ⚙️ Gestione PM2

```bash
# Stato processi
pm2 status

# Log in tempo reale
pm2 logs server

# Riavvio app
pm2 restart server

# Stop app
pm2 stop server
```

---

## 🔐 Sicurezza & Backup

- **Mai** committare `.env`, `database.db`, o `.ssh/` su GitHub.  
- Usa `.gitignore` robusto.  
- Backup database dal server al PC:

```bash
scp ubuntu@51.75.70.149:/home/ubuntu/taplinknfc/database.db C:\percorso\backup\locali\
```

---

Fine del file.
