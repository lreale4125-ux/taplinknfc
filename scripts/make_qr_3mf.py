import os
import subprocess
import logging
import argparse
import sys

# --- Configurazione del Logging ---
logging.basicConfig(level=logging.INFO, format='[Python Script] %(levelname)s: %(message)s')
log = logging.getLogger('QR_3D_FLOW')

# --- Parametri di Modellazione Fissi (Costanti Essenziali) ---
DEBOSS_DEPTH = 0.3      # Profondità dell'incisione (mm) - Copiato dal codice originale
MODEL_Z_HEIGHT = 5.0   # <<< CRITICO: Altezza Z totale del tuo 'base.3mf' in mm. MODIFICARE QUI!

# --- Nomi File Temporanei (Interni allo script) ---
SCAD_SCRIPT_FILE = "temp_render_script.scad"
# Sotto-directory per la derivazione dei percorsi da output 3MF
SVG_SUBDIR = 'qr_svg'
M3MF_SUBDIR = 'qr_3mf' 

# --- Funzione di Parsing Argomenti ---

def parse_arguments():
    """Analizza gli argomenti passati da riga di comando dal file JS."""
    parser = argparse.ArgumentParser(description="Genera un modello 3MF inciso con QR Code.")
    
    # Argomenti richiesti (passati dal JS)
    parser.add_argument('--input-3mf', required=True, help="Percorso completo al file 3MF di base.")
    parser.add_argument('--output-3mf', required=True, help="Percorso completo dove salvare il file 3MF di output.")
    parser.add_argument('--qr-data', required=True, help="Contenuto (URL) del QR Code da incidere.")
    parser.add_argument('--qr-size-mm', type=float, required=True, help="Dimensione lato del QR Code in mm (per la scala).")
    parser.add_argument('--qr-margin-mm', type=float, required=False, default=1.5, help="Margine in mm attorno al QR Code.")

    return parser.parse_args()

# --- Logica OpenSCAD (Generazione Script) ---

def generate_scad_script(args: argparse.Namespace, svg_path: str):
    """
    Genera il file OpenSCAD (.scad) iniettando i parametri per la sola incisione (difference).
    """
    # Usiamo un fattore di scala fisso per adattare il QR al modello. 
    QR_SCALE_FACTOR = 0.65 

    scad_content = f"""
// --- VARIABILI INIETTATE DA PYTHON ---
MODEL_FILENAME = "{args.input_3mf}";
QR_SVG_FILENAME = "{svg_path}";
DEBOSS_DEPTH = {DEBOSS_DEPTH};
MODEL_Z_HEIGHT = {MODEL_Z_HEIGHT};
QR_SIZE_MM = {args.qr_size_mm};

// --- QR CODE ESTRUSO (TIMBRO DI INCISIONE) ---
module qr_stamp() {{
    // Lo estrudiamo più in alto del necessario (Z + 1.0) per garantire un taglio completo
    linear_extrude(height = MODEL_Z_HEIGHT + 1.0, center = true) {{ 
        // Applica la scala per adattare il QR all'area di incisione.
        scale([{QR_SCALE_FACTOR}, {QR_SCALE_FACTOR}]) 
        import(QR_SVG_FILENAME, center = true);
    }}
}}

// --- OPERAZIONE FINALE (SOLO INCISIONE) ---
// difference(base_model, qr_stamp)
difference() {{
    // 1. Modello di base (importato)
    import(MODEL_FILENAME, convexity = 10);
    
    // 2. Sottrai il timbro QR (incisione)
    // Posiziona la base dell'incisione a Z_max - DEBOSS_DEPTH
    // Il timbro è centrato (center=true), quindi lo spostiamo per allineare l'incisione.
    translate([0, 0, MODEL_Z_HEIGHT/2 - DEBOSS_DEPTH/2]) {{ 
         qr_stamp(); 
    }}
}}
"""
    # Scrivi lo script SCAD nella directory dello script Python
    scad_filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), SCAD_SCRIPT_FILE)
    
    with open(scad_filepath, 'w') as f:
        f.write(scad_content)
    log.info(f"Script OpenSCAD per sola incisione generato in {scad_filepath}")
    return scad_filepath


def render_model_with_openscad(scad_filepath: str, output_filepath: str) -> bool:
    """
    Esegue il rendering del file .scad in .3mf usando OpenSCAD da riga di comando.
    """
    os.makedirs(os.path.dirname(output_filepath), exist_ok=True)
    
    command = [
        "openscad", 
        "-o", output_filepath, 
        scad_filepath
    ]
    
    log.info(f"Avvio rendering OpenSCAD: {' '.join(command)}")
    
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        log.info(f"Modello finale esportato con successo in {output_filepath}")
        return True
        
    except subprocess.CalledProcessError as e:
        log.error(f"Errore OpenSCAD (Codice: {e.returncode}). Output: {e.stderr}")
        return False
    except FileNotFoundError:
        log.error("Comando 'openscad' non trovato. Verifica l'installazione.")
        return False

# --- Esecuzione Principale ---
def main():
    args = parse_arguments()
    
    # 1. Deriva il percorso del file SVG dal percorso di output 3MF passato dal JS
    svg_filename = os.path.basename(args.output_3mf).replace('.3mf', '.svg')
    # Ricostruisce il percorso assoluto dell'SVG basandosi sulla struttura delle directory di Node.js
    # Esempio: /.../public/qrcodes/qr_3mf -> /.../public/qrcodes/qr_svg
    svg_dir = os.path.dirname(args.output_3mf).replace(M3MF_SUBDIR, SVG_SUBDIR)
    
    svg_path = os.path.join(svg_dir, svg_filename)

    if not os.path.exists(svg_path):
        log.error(f"File SVG non trovato nel percorso atteso: {svg_path}")
        sys.exit(1)

    log.info(f"SVG input derivato: {svg_path}")
    
    # 2. Genera lo script SCAD
    scad_filepath = generate_scad_script(args, svg_path)
    
    # 3. Esegui il rendering 
    if not render_model_with_openscad(scad_filepath, args.output_3mf):
        sys.exit(1)
        
    # 4. Pulizia
    try:
        os.remove(scad_filepath)
    except OSError:
        pass 
        
    log.info("Processo di modellazione 3D completato.")

if __name__ == "__main__":
    main()
