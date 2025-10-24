const path = require('path');
const QRCode = require('qrcode');
const fs = require('fs/promises'); // Importazione asincrona

// --- CONFIGURAZIONE PERCORSI ---
// Percorso assoluto della cartella radice per i QR (es: /taplinknfc/public/qrcodes)
const QR_BASE_DIR = path.resolve(__dirname, '..', '..', 'public', 'qrcodes');
const PNG_SUBDIR = 'qr_png';
const SVG_SUBDIR = 'qr_svg';

/**
 * Genera il QR Code con l'URL e lo salva in formato PNG e SVG in sottocartelle separate.
 * @param {string} keychainId - L'ID univoco (es. '001', 'Ospite').
 */
async function generateAndSaveQR(keychainId) {
    const baseUrl = process.env.MOTIVATIONAL_URL || 'https://motivazional.taplinknfc.it/';
    
    // 1. Costruisci l'URL completo con l'ID personalizzato
    const qrData = `${baseUrl}?id=${encodeURIComponent(keychainId)}`;
    
    // 2. Definizione dei percorsi
    const filename = keychainId;

    const pngDir = path.join(QR_BASE_DIR, PNG_SUBDIR);
    const svgDir = path.join(QR_BASE_DIR, SVG_SUBDIR);

    const pngPath = path.join(pngDir, `${filename}.png`);
    const svgPath = path.join(svgDir, `${filename}.svg`);

    try {
        // 3. Verifica e creazione ricorsiva delle sottocartelle (principale, PNG, SVG)
        // 'recursive: true' crea tutte le cartelle necessarie e non fallisce se esistono già.
        await fs.mkdir(pngDir, { recursive: true });
        await fs.mkdir(svgDir, { recursive: true });

        // 4. GENERAZIONE PNG
        await QRCode.toFile(pngPath, qrData, {
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 300,
            type: 'png'
        });
        
        // 5. GENERAZIONE SVG (necessario per l'automazione 3D futura)
        const svgString = await QRCode.toString(qrData, {
            errorCorrectionLevel: 'H',
            type: 'svg',
            margin: 1 
        });
        await fs.writeFile(svgPath, svgString);
        
        console.log(`[QR Generator] Salvati PNG in ${pngPath} e SVG in ${svgPath}`);

    } catch (err) {
        console.error(`[QR Generator] Errore durante la generazione per ID ${keychainId}:`, err);
        // Rilancia un errore più specifico al controller
        throw new Error(`Errore durante la generazione QR: ${err.message}`);
    }
}

module.exports = {
    generateAndSaveQR,
    QR_DIR: QR_BASE_DIR 
};
