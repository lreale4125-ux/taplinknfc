import os
import subprocess
import logging
import argparse
import sys

# --- Configurazione del Logging ---
logging.basicConfig(level=logging.INFO, format='[Python Script] %(levelname)s: %(message)s')
log = logging.getLogger('QR_3D_FLOW')

# --- Parametri di Modellazione Fissi (Costanti) ---
DEBOSS_DEPTH = 0.3      # Profondità dell'incisione (mm). (Dal tuo codice originale)
MODEL_Z_HEIGHT = 5.0   # <<< CRITICO: Altezza Z totale del tuo 'base.3mf' in mm. MODIFICARE QUI!
QR_SCALE_FACTOR = 0.65  # Fattore di scala per adattare il QR al modello.

# --- Nomi File Temporanei (Interni allo script) ---
SCAD_SCRIPT_FILE = "temp_render_script.scad"
# Sotto-directory per la derivazione dei percorsi SVG/3MF dal JS
SVG_SUBDIR = 'qr_svg'
M3MF_SUBDIR = 'qr_3mf' 

# --- Funzione di Parsing Argomenti ---

def parse_arguments():
    """Analizza gli argomenti passati da riga di comando dal file JS."""
    parser = argparse.ArgumentParser(description="Genera un modello 3MF inciso con QR Code.")
    
    parser.add_argument('--input-3mf', required=True, help="Percorso completo al file 3MF di base.")
    parser.add_argument('--output-3mf', required=True, help="Percorso completo dove salvare il file 3MF di output.")
    parser.add_argument('--qr-data', required=True, help="Contenuto (URL) del QR Code da incidere.")
    parser.add_argument('--qr-size-mm', type=float, required=True, help="Dimensione lato del QR Code in mm (per la scala).")
    parser.add_argument('--qr-margin-mm', type=float, required=False, default=1.5, help="Margine in mm attorno al QR Code.")

    return parser.parse_args()

# --- Logica OpenSCAD (Generazione Script) ---

def generate_scad_script(args: argparse.Namespace, svg_path: str):
    """
    Genera il file OpenSCAD (.scad) per la sola incisione sulla faccia inferiore.
    """
    
    scad_content = f"""
// --- VARIABILI INIETTATE DA PYTHON ---
MODEL_FILENAME = "{args.input_3mf}";
QR_SVG_FILENAME = "{svg_path}";
DEBOSS_DEPTH = {DEBOSS_DEPTH};
MODEL_Z_HEIGHT = {MODEL_Z_HEIGHT}; 
QR_SIZE_MM = {args.qr_size_mm};

// --- QR CODE ESTRUSO (TIMBRO DI INCISIONE) ---
module qr_stamp() {{
    // Estrundi il profilo SVG con l'altezza di incisione. center=false.
    linear_extrude(height = DEBOSS_DEPTH, center = false) {{ 
        // 1. Ruota di 180 gradi sull'asse X per ribaltare l'immagine 
        // (necessario affinché il QR sia leggibile dopo la stampa e l'incisione dal basso).
        rotate([180, 0, 0]) {{ 
            // 2. Applica la scala e centra l'SVG nel suo spazio 2D.
            scale([{QR_SCALE_FACTOR}, {QR_SCALE_FACTOR}]) 
            import(QR_SVG_FILENAME, center = true); 
        }}
    }}
}}

// --- OPERAZIONE FINALE (SOLO INCISIONE) ---
// Sottrai il timbro QR dal modello base.
difference() {{
    // 1. Modello di base
    import(MODEL_FILENAME, convexity = 10);
    
    // 2. Sottrai il timbro QR (incisione)
    // Trasla il timbro in Z. Diamo un leggero offset (0.01mm) verso l'alto 
    // per assicurare che il taglio avvenga appena sopra la base (Z=0).
    translate([0, 0, 0.01]) {{
        qr_stamp(); 
    }}
}}
"""
    # Scrivi lo script SCAD
    scad_filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), SCAD_SCRIPT_FILE)
    
    with open(scad_filepath, 'w') as f:
        f.write(scad_content)
    log.info(f"Script OpenSCAD per sola incisione (lato inferiore) generato in {scad_filepath}")
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
    
    # 1. Deriva il percorso del file SVG dal percorso di output 3MF
    svg_filename = os.path.basename(args.output_3mf).replace('.3mf', '.svg')
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
