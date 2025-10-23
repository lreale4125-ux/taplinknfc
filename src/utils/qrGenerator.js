const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Definisci la cartella dove salverai i QR code
const QR_DIR = path.join(__dirname, '..', '..', 'qrcodes');

// Assicurati che la cartella esista
if (!fs.existsSync(QR_DIR)) {
    fs.mkdirSync(QR_DIR, { recursive: true });
    console.log(`[QR Generator] Creata la directory: ${QR_DIR}`);
}

/**
 * Genera un QR code per un ID specifico e lo salva come file PNG.
 * @param {string} keychainId - L'ID univoco (es. '001', 'Ospite').
 * @returns {string} Il percorso del file QR code salvato.
 */
async function generateAndSaveQR(keychainId) {
    const baseUrl = 'https://motivazional.taplinknfc.it/';
    
    // 1. Costruisci l'URL completo con l'ID personalizzato
    const url = `${baseUrl}?id=${encodeURIComponent(keychainId)}`;
    
    // 2. Definisci il nome e il percorso del file
    const fileName = `${keychainId}.png`;
    const filePath = path.join(QR_DIR, fileName);

    try {
        // 3. Genera e salva il QR code come immagine PNG
        await QRCode.toFile(filePath, url, {
            color: {
                dark: '#000000', // Colore dei blocchi QR
                light: '#FFFFFF' // Colore dello sfondo
            },
            width: 300 // Dimensione in pixel
        });
        
        console.log(`[QR Generator] Salvato QR code per ID: ${keychainId} in ${filePath}`);
        return filePath;
        
    } catch (err) {
        console.error(`[QR Generator] Errore durante la generazione per ID ${keychainId}:`, err);
        throw new Error("Errore generazione QR");
    }
}

module.exports = {
    generateAndSaveQR,
    QR_DIR // Esporta la cartella per l'accesso statico
};
