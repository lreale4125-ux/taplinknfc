# 🪪 NFC Analytics - Guida al Deployment Full-Stack

Una piattaforma completa di analisi per portachiavi NFC con gestione utenti, controlli di amministrazione e analisi in tempo reale.

---

## 🚀 Funzionalità

- **Registrazione Aziendale**: Gli utenti si registrano con il nome dell'azienda, creato dinamicamente.  
- **Gestione Admin**: Pannello completo per la gestione di utenti, aziende e link.  
- **Gestione Saldo**: Sistema di ricarica e addebito “TAP” per utenti.  
- **Analisi Real-Time**: Traccia le scansioni dei portachiavi NFC con analisi dettagliate.  
- **Generazione QR Code**: Genera automaticamente QR Code (`.png`, `.svg`) e **Modelli 3D (`.3mf`)** tramite script Python.  
- **Autenticazione Sicura**: Basata su JWT con controllo ruoli.

---

## 📋 Prerequisiti

- VPS con **Ubuntu 22.04+**
- **Dominio** (es. `taplinknfc.it`) puntato alla VPS
- **Node.js 18+**
- **Python 3.10+** e `python3-venv`
- **Nginx**
- **PM2** (Process Manager)
- Repository **GitHub privata**
- **Personal Access Token (PAT)** con permessi `repo`

---

## 🚀 Deployment in Produzione (Da una Nuova VPS)

Guida passo-passo per il deployment completo da zero.

---

### 1️⃣ Backup del Vecchio Server (se applicabile)

1. **Codice sorgente**
   - Esegui il push del progetto su una repo GitHub privata.
   - Assicurati che `.gitignore` includa:
     ```
     node_modules/
     .env
     .ssh/
     *.db*
     ```
2. **Configurazione Nginx**
   - Copia `/etc/nginx/sites-available/taplinknfc` nel progetto.
   - Fai push anche di questo file.

3. **Database**
   - Scarica `database.db`, `*.db-wal`, `*.db-shm` sul PC:
     ```bash
     scp ubuntu@<IP_VECCHIO>:/home/ubuntu/taplinknfc/database.db .
     ```

4. **File `.env`**
   - Copia e salva in locale tutte le variabili sensibili.

---

### 2️⃣ Setup della Nuova VPS

Connettiti via SSH e installa i pacchetti base:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install git nodejs npm nginx -y
sudo apt install python3 python3-venv -y
sudo npm install -g pm2
```

---

### 3️⃣ Clona e Installa il Progetto

```bash
git clone https://github.com/lreale4125-ux/taplinknfc.git
cd taplinknfc
npm install
```

---

### 3b️⃣ Setup Ambiente Virtuale Python (per generazione 3MF)

```bash
cd scripts
python3 -m venv qr_env
source qr_env/bin/activate
pip install -r requirements.txt
deactivate
cd ..
```

---

### 4️⃣ Ripristina i File Critici

Crea il file `.env`:

```bash
nano .env
```
# Chiave per firmare i token di accesso (inventane una tu, lunga e complessa)
JWT_SECRET=questa-e'-la-tua-password-segreta-cambiala-in-produzione

# La tua chiave API per il servizio di geocoding OpenCage
OPENCAGE_API_KEY=392153fd2f3940d6a1daac24cc41a966#
Production Environment Variables
NODE_ENV=production
PORT=3001
DATABASE_PATH=./database.db

#frasi motivazionali gemini
GEMINI_API_KEY=AIzaSyAsvdxr6FB7LEuQjuQc6VLxbdqqS9hBaZQ

# CORS Origin for production
CORS_ORIGIN=https://taplinknfc.it



Poi carica il database:

```bash
scp C:\percorso\database.db ubuntu@51.75.70.149:/home/ubuntu/taplinknfc/database.db
```

---

### 5️⃣ Configura Nginx

```bash
sudo cp taplinknfc /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/taplinknfc /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

### 6️⃣ Configura SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d taplinknfc.it -d www.taplinknfc.it -d motivazional.taplinknfc.it
```

Scegli:
- Email amministratore
- Accetta termini (Y)
- Opzione **2 (Redirect)** per HTTPS

---

### 7️⃣ Avvia l’Applicazione con PM2

```bash
pm2 start src/index.js --name server
pm2 save
pm2 startup
```

✅ **Il sito è ora live!**

---

## 🔄 Aggiornare il Progetto (Flusso Git)

Sul tuo **PC locale**:
```bash
git add .
git commit -m "Aggiornata la homepage"
git push
```

Sulla **VPS**:
```bash
cd ~/taplinknfc
git pull
pm2 restart server
```

Se hai aggiunto dipendenze:
```bash
npm install && pm2 restart server
```

Aggiornamento ambiente Python:
```bash
cd scripts
source qr_env/bin/activate
pip install -r requirements.txt
deactivate
cd ..
pm2 restart server
```

---

## 🔧 Troubleshooting (Problemi Comuni)

### 🚨 Errore 1 — SSH: REMOTE HOST IDENTIFICATION HAS CHANGED!
```bash
ssh-keygen -R 51.75.70.149
```

### 🚨 Errore 2 — `sudo nginx -t` fallisce (SSL)
Commenta le righe SSL in `/etc/nginx/sites-available/taplinknfc`, poi:
```bash
sudo systemctl reload nginx
sudo certbot --nginx
```

### 🚨 Errore 3 — 403/500 su Homepage
```bash
sudo chmod 755 /home/ubuntu
sudo chmod -R 755 /home/ubuntu/taplinknfc
```

### 🚨 Errore 4 — “no such table: users”
```bash
pm2 restart server
```

### 🚨 Errore 5 — 500 Generazione QR Code (EACCES)
```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/taplinknfc/public
pm2 restart server
```

---

## 📁 Struttura del Progetto

```
/home/ubuntu/taplinknfc/
├── public/
│   ├── images/
│   ├── qrcodes/
│   │   ├── qr_png/
│   │   ├── qr_svg/
│   │   └── qr_3mf/
│   ├── admin_panel.html
│   ├── dashboard_utente.html
│   ├── index.html
│   └── wallet.html
├── scripts/
│   ├── qr_env/
│   ├── base.3mf
│   ├── make_qr_3mf.py
│   └── requirements.txt
├── src/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── index.js
├── database.db
├── .env
├── package.json
├── taplinknfc
└── tailwind.config.js
```

---

## 🔧 Configurazione `.env`

```env
# Variabili di Produzione
NODE_ENV=production
PORT=3001

# JWT Secret
JWT_SECRET=LaMiaPasswordSegretaSuperLungaECasualePerIl2025

# Database
DATABASE_PATH=./database.db

# CORS
CORS_ORIGIN=https://taplinknfc.it

# API Keys
OPENCAGE_API_KEY=392153fd2f3940d6a1daac24cc41a966
GEMINI_API_KEY=LaTuaChiaveApiGemini

# Servizi
MOTIVATIONAL_URL=https://motivazional.taplinknfc.it
```

---

## ⚙️ Gestione PM2

```bash
pm2 status        # Stato processi
pm2 logs server   # Log in tempo reale
pm2 restart server
pm2 stop server
```

---

## 🔐 Sicurezza & Backup

- ❌ Non committare mai `.env`, `database.db`, `.ssh/` su GitHub.  
- ✅ Usa `.gitignore` completo.  
- 💾 Backup database:
  ```bash
  scp ubuntu@51.75.70.149:/home/ubuntu/taplinknfc/database.db C:\backup\locali\
  ```

---

## 🧠 Autore

**Lorenzo Reale** — [GitHub](https://github.com/lreale4125-ux)  
Piattaforma *NFC Analytics* — 2025

