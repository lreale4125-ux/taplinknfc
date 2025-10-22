# NFC Analytics - Guida al Deployment Full-Stack

Una piattaforma completa di analisi per portachiavi NFC con gestione utenti, controlli di amministrazione e analisi in tempo reale.

## 🚀 Funzionalità

-   **Registrazione Aziendale**: Gli utenti si registrano con il nome dell'azienda, creato dinamicamente.
-   **Gestione Admin**: Solo gli admin possono assegnare numeri di portachiavi e gestire i link.
-   **Analisi Real-Time**: Traccia le scansioni dei portachiavi NFC con analisi dettagliate.
-   **Gestione Link**: Crea link aziendali a cui tutti i portachiavi reindirizzano.
-   **Autenticazione Sicura**: Autenticazione basata su JWT con controllo degli accessi basato sui ruoli.

## 📋 Prerequisiti

-   Una VPS con **Ubuntu 22.04+**
-   Un **Nome di Dominio** (es. `taplinknfc.it`) puntato all'IP della tua VPS.
-   **Node.js 18+**
-   **Nginx**
-   **PM2** (Process Manager)
-   Un account **GitHub** per una repository privata.
-   Un **Personal Access Token (PAT)** di GitHub con permessi `repo` (per fare push/clone dalla VPS).

---

## 🚀 Deployment in Produzione (Da una Nuova VPS)

Questa guida copre un deployment pulito da un server nuovo usando un flusso di lavoro basato su Git.

### 1. Backup del Vecchio Server (Se applicabile)

Prima di resettare il tuo vecchio server, fai il backup dei file critici:

1.  **Codice Sorgente**: Fai il push di tutto il codice su una **repository GitHub privata**. Assicurati che il file `.gitignore` escluda `node_modules/`, `.env`, `.ssh/`, e i file del database (`*.db*`).
2.  **Configurazione Nginx**: Copia la configurazione del tuo sito Nginx (es. `/etc/nginx/sites-available/taplinknfc`) nella cartella del progetto e fai il push anche di questo file su GitHub.
3.  **Database**: Scarica in modo sicuro il tuo file `database.db` (e i file `.db-wal` / `.db-shm`) sul tuo PC locale usando `scp`.
4.  **File `.env`**: Copia il contenuto del tuo file `.env` (password, API key) e salvalo in un posto sicuro sul tuo PC locale.

### 2. Setup della Nuova VPS

Dopo aver resettato la VPS, connettiti via SSH.

```bash
# Aggiorna e fai l'upgrade dei pacchetti di sistema
sudo apt update && sudo apt upgrade -y

# Installa Git, Node.js (18.x), npm, e Nginx
sudo apt install git nodejs npm nginx -y

# Installa PM2 (Process Manager) globalmente
sudo npm install -g pm2
```

### 3. Clona e Installa il Progetto

```bash
# Clona la tua repository privata da GitHub
# Ti chiederà Username e Password (usa il tuo Personal Access Token)
git clone [https://github.com/lreale4125-ux/taplinknfc.git](https://github.com/lreale4125-ux/taplinknfc.git)

# Entra nella cartella del progetto
cd taplinknfc

# Installa tutte le dipendenze del progetto da package.json
npm install
```

### 4. Ripristina i File Critici

1.  **Crea il file `.env`**:
    ```bash
    nano .env
    ```
    Incolla i tuoi segreti che avevi salvato (es. `PORT=3001`, `JWT_SECRET=...`, `DATABASE_PATH=./database.db`).
    Salva e chiudi (`Ctrl+O`, `Invio`, `Ctrl+X`).

2.  **Carica il tuo Database**:
    Dal **terminale del tuo PC locale** (CMD, PowerShell, ecc.), usa `scp` per caricare il tuo backup del database:
    ```bash
    # Esegui questo dal tuo PC LOCALE
    scp C:\percorso\del\tuo\database.db ubuntu@51.75.70.149:/home/ubuntu/taplinknfc/database.db
    ```
    *(Carica anche i file `.db-wal` e `.db-shm` se li hai)*

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
*(Se questo test fallisce, vedi la sezione "Troubleshooting")*

```bash
# Ricarica Nginx per applicare le modifiche
sudo systemctl reload nginx
```

### 6. Configura SSL (Let's Encrypt)

```bash
# Installa Certbot e il suo plugin per Nginx
sudo apt install certbot python3-certbot-nginx -y

# Esegui Certbot per ottenere i certificati SSL
# Leggerà automaticamente i domini dal tuo file di configurazione
sudo certbot --nginx -d taplinknfc.it -d www.taplinknfc.it

# Segui le istruzioni a schermo:
# 1. Inserisci la tua email (per gli avvisi di scadenza).
# 2. Accetta i termini di servizio (Y).
# 3. Scegli l'Opzione 2 (Redirect) per forzare tutto il traffico HTTP su HTTPS.
```
Certbot aggiornerà automaticamente la tua configurazione Nginx e ricaricherà il servizio.

### 7. Avvia l'Applicazione con PM2

Infine, avvia il tuo server backend `server.js`.

```bash
# Avvia il tuo server usando PM2
pm2 start server.js

# Salva la lista dei processi attuali
pm2 save

# Configura PM2 per avviarsi al riavvio del server
pm2 startup
```
(PM2 ti darà un comando da copiare e incollare per completare la configurazione di avvio).

**Il tuo sito ora è live e configurato!** 🚀

---

## 🔄 Come Aggiornare il Progetto (Il Flusso di Lavoro Git)

Il vantaggio più grande di questa configurazione è la facilità di aggiornamento.

1.  **Sul tuo PC Locale:**
    Fai le modifiche al codice (es. cambi `index.html`). Salva le modifiche e caricale su GitHub:
    ```bash
    git add .
    git commit -m "Aggiornata la homepage"
    git push
    ```

2.  **Sulla tua VPS:**
    Connettiti via SSH, vai nella cartella del progetto e scarica le modifiche:
    ```bash
    cd ~/taplinknfc  # Entra nella cartella del progetto
    git pull         # Scarica le modifiche da GitHub
    ```

3.  **Applica le Modifiche:**
    -   **Se hai modificato solo file statici** (HTML, CSS, JS frontend): Non devi fare nient'altro.
    -   **Se hai modificato il backend** (`server.js`): Riavvia il server PM2:
        ```bash
        pm2 restart server
        ```
    -   **Se hai aggiunto nuove dipendenze**: Esegui `npm install` prima di riavviare PM2.

---

## 🔧 Troubleshooting (Risoluzione Problemi Comuni)

Se incontri un errore, controlla qui. Questi sono i problemi che abbiamo risolto durante questo deployment.

### 🚨 Errore 1: La connessione SSH fallisce dopo il reset della VPS.

-   **Sintomo**: `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!`
-   **Causa**: Il tuo PC si ricorda la "vecchia" impronta digitale della VPS. La "nuova" VPS resettata ha un'impronta diversa.
-   **Soluzione (Sul tuo PC locale)**: Rimuovi la vecchia chiave.
    ```bash
    ssh-keygen -R 51.75.70.149
    ```
    Riconnettiti e scrivi `yes` per accettare la nuova impronta.

### 🚨 Errore 2: `sudo nginx -t` fallisce.

-   **Sintomo**: `nginx: configuration file test failed`
-   **Log**: `open() "/etc/letsencrypt/options-ssl-nginx.conf" failed (2: No such file or directory)`
-   **Causa**: Il tuo file di configurazione Nginx (dal backup) cerca di caricare i file SSL di Certbot *prima* che Certbot sia stato eseguito.
-   **Soluzione**:
    1.  Modifica temporaneamente il file: `sudo nano /etc/nginx/sites-available/taplinknfc`
    2.  **Commenta** (metti un `#` all'inizio) tutte le righe relative a SSL (es. `listen 443 ssl;`, `ssl_certificate`, `include /etc/letsencrypt/...`).
    3.  Salva il file. Ora `sudo nginx -t` funzionerà.
    4.  Esegui `sudo systemctl reload nginx`.
    5.  Esegui il comando `sudo certbot --nginx ...` (Passo 6). Certbot troverà il file, lo correggerà e **rimuoverà i commenti** per te.

### 🚨 Errore 3: `403 Forbidden` o `500 Internal Server Error` (Sulla Homepage)

-   **Sintomo**: Il sito non carica, nemmeno la homepage.
-   **Log**: `sudo tail -f /var/log/nginx/error.log` mostra:
    `stat() "/home/ubuntu/taplinknfc/index.html" failed (13: Permission denied)`
-   **Causa**: Nginx (che gira come utente `www-data`) non ha i permessi per *entrare* nella cartella `/home/ubuntu` e *leggere* i file del tuo progetto.
-   **Soluzione**: Concedi i permessi corretti.
    ```bash
    # Permetti a "altri" (come www-data) di entrare nella tua home
    sudo chmod 755 /home/ubuntu
    
    # Rendi leggibili i file del tuo progetto
    sudo chmod -R 755 /home/ubuntu/taplinknfc
    ```

### 🚨 Errore 4: `500 Internal Server Error` (Solo sulle API, es. Login)

-   **Sintomo**: La homepage (file statico) carica, ma le chiamate API (come il login) falliscono.

-   **Caso A: I log di PM2 sono SILENZIOSI (nessun errore).**
    -   **Log (Nginx)**: `sudo tail -f /var/log/nginx/error.log` mostra `(111: Connection refused) while connecting to upstream`.
    -   **Causa**: Nginx sta provando a contattare `localhost:3001` (il tuo server Node.js), ma il firewall della VPS (`ufw`) sta bloccando la connessione *interna*.
    -   **Soluzione**: Apri la porta internamente.
        ```bash
        sudo ufw allow 3001
        sudo systemctl reload nginx
        ```

-   **Caso B: I log di PM2 mostrano un CRASH.**
    -   **Log (PM2)**: `pm2 logs` mostra `Error: SQLITE_ERROR: no such table: users`.
    -   **Causa**: Il tuo `server.js` è partito e ha creato un file `database.db` **nuovo e vuoto**. Quando provi a fare login, la tabella `users` non esiste.
    -   **Soluzione**: Devi caricare il tuo vecchio database (vedi Passo 4).
        1.  Esegui `scp` dal tuo PC locale per sovrascrivere il file `.db` vuoto sulla VPS.
        2.  Riavvia l'applicazione sulla VPS: `pm2 restart server`.

---

## 📁 Struttura Progetto (Sul Server)

```
/home/ubuntu/taplinknfc/
├── server.js         # Backend server (gestito da PM2)
├── package.json      # Dipendenze
├── taplinknfc        # File config. Nginx (usato come backup)
├── .env              # Variabili d'ambiente (CREATO A MANO, NON su Git)
├── .gitignore        # Dice a Git cosa ignorare
├── database.db       # Database SQLite (RIPRISTINATO A MANO, NON su Git)
├── index.html        # Frontend HTML
├── admin_panel.html  # Frontend HTML
└── images/           # File statici (immagini)
```

## 🔧 Configurazione (.env)

Il tuo file `.env` deve essere creato manualmente sul server e non va mai messo su Git.

```env
# Chiave per firmare i token di accesso (inventane una tu, lunga e complessa)
JWT_SECRET=LaMiaPasswordSegretaSuperLungaECasualePerIl2025

# La tua chiave API per il servizio di geocoding OpenCage
OPENCAGE_API_KEY=392153fd2f3940d6a1daac24cc41a966#
Production Environment Variables
NODE_ENV=production
PORT=3001
JWT_SECRET=your-super-secure-jwt-secret-change-this-in-production
DATABASE_PATH=./database.db

# CORS Origin for production
CORS_ORIGIN=https://taplinknfc.it
```

## ⚙️ Gestione PM2

```bash
# Controlla lo stato della tua app
pm2 status

# Guarda i log in tempo reale (per il debug)
pm2 logs

# Riavvia la tua app
pm2 restart server

# Ferma la tua app
pm2 stop server
```

## 🔐 Sicurezza & Backup

-   **CRITICO**: I file `.env`, `database.db`, e la cartella `.ssh/` **non devono MAI** finire su GitHub. Usa un file `.gitignore` robusto per prevenire la fuga di segreti.
-   **Backup Database**: Per fare un backup del database live dalla VPS al tuo PC locale, esegui questo comando **dal tuo PC locale**:
    ```bash
    scp ubuntu@51.75.70.149:/home/ubuntu/taplinknfc/database.db C:\percorso\backup\locali\
    ```

