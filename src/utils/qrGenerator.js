const path = require('path');
const QRCode = require('qrcode');
const fs = require('fs/promises');
const { exec } = require('child_process');

// --- CONFIGURAZIONE PERCORSI ---
const QR_BASE_DIR = path.resolve(__dirname, '..', '..', 'public', 'qrcodes');
const PNG_SUBDIR = 'qr_png';
const SVG_SUBDIR = 'qr_svg';
const M3MF_SUBDIR = 'qr_3mf';

// --- CONFIGURAZIONE SCRIPT PYTHON ---
const SCRIPT_DIR = path.resolve(__dirname, '..', '..', 'scripts');
const PYTHON_SCRIPT_PATH = path.join(SCRIPT_DIR, 'make_qr_3mf.py');
const PYTHON_VENV_PATH = path.resolve(__dirname, '..', '..', 'venv_qr', 'bin', 'python');
const BASE_MODEL_PATH = path.join(SCRIPT_DIR, 'base.3mf');
const QR_SIZE_MM = 22;
const QR_MARGIN_MM = 1.5;

/**
 * Esegue lo script Python e gestisce i suoi output/errori.
 * (Questa funzione rimane invariata)
 */
function runPythonScript(command) {
    console.log(`[QR Generator] Esecuzione comando: ${command}`);

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (stdout) {
                console.log(`[Python Script] ${stdout.trim()}`);
            }
            if (stderr) {
                console.error(`[Python Error] ${stderr.trim()}`);
            }
            if (error) {
                const errorMessage = stderr || error.message;
                reject(new Error(`Errore script Python: ${errorMessage.trim()}`));
                return;
            }
            resolve();
        });
    });
}


/**
 * Genera il QR Code con l'URL e lo salva in formato PNG, SVG e 3MF.
 * @param {string} keychainId - L'ID univoco (es. '001', 'Ospite').
 */
async function generateAndSaveQR(keychainId) {
    
    // ===================================================================
    // 🛑 MODIFICA CRUCIALE 1: URL DI BASE
    // ===================================================================
    // Questo NON deve essere 'motivazional.taplinknfc.it'.
    // Deve essere il dominio principale della TUA applicazione Node.js,
    // quello che esegue 'redirects.js'.
    // Imposta APP_DOMAIN nel tuo file .env o sostituisci il fallback.
    const baseUrl = process.env.APP_DOMAIN || 'https://taplinknfc.it';
    
    // ===================================================================
    // 🛑 MODIFICA CRUCIALE 2: STRUTTURA URL
    // ===================================================================
    // Il QR deve puntare alla rotta '/k/' che abbiamo definito in 'redirects.js',
    // non alla rotta '/?id='.
    const qrData = `${baseUrl}/k/${encodeURIComponent(keychainId)}`;
    
    
    // 2. Definizione dei percorsi (Invariato)
    const filename = keychainId;

    const pngDir = path.join(QR_BASE_DIR, PNG_SUBDIR);
    const svgDir = path.join(QR_BASE_DIR, SVG_SUBDIR);
    const m3mfDir = path.join(QR_BASE_DIR, M3MF_SUBDIR);

    const pngPath = path.join(pngDir, `${filename}.png`);
    const svgPath = path.join(svgDir, `${filename}.svg`);
    const m3mfPath = path.join(m3mfDir, `${filename}.3mf`);

    try {
        // 3. Verifica e creazione ricorsiva delle sottocartelle (Invariato)
        await fs.mkdir(pngDir, { recursive: true });
        await fs.mkdir(svgDir, { recursive: true });
        await fs.mkdir(m3mfDir, { recursive: true });

        // 4. GENERAZIONE PNG (Invariato)
        await QRCode.toFile(pngPath, qrData, {
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 300,
            type: 'png'
        });
        
        // 5. GENERAZIONE SVG (Invariato)
        const svgString = await QRCode.toString(qrData, {
            errorCorrectionLevel: 'H',
            type: 'svg',
            margin: 1 
        });
        await fs.writeFile(svgPath, svgString);
        
        // 6. CHIAMATA A PYTHON PER GENERARE IL 3MF (Invariato)
        
        // Costruisci il comando, usando 'python3' come eseguibile
        const command = [
            `"${PYTHON_VENV_PATH}"`,
            `"${PYTHON_SCRIPT_PATH}"`,
            `--input-3mf "${BASE_MODEL_PATH}"`,
            `--output-3mf "${m3mfPath}"`,
            `--qr-data "${qrData}"`, // Passa il nuovo qrData (/k/...)
            `--qr-size-mm ${QR_SIZE_MM}`,
            `--qr-margin-mm ${QR_MARGIN_MM}`
        ].join(' ');
        
        await runPythonScript(command);
        
        console.log(`[QR Generator] Salvataggio completato: PNG, SVG, e 3MF per ${keychainId}`);

    } catch (err) {
        console.error(`[QR Generator] Errore FATALE durante la generazione per ID ${keychainId}:`, err);
        // Rilancia un errore più specifico al controller
        throw new Error(`Errore durante la generazione QR/3MF: ${err.message}`);
    }
}

module.exports = {
    generateAndSaveQR,
    QR_DIR: QR_BASE_DIR 
};
