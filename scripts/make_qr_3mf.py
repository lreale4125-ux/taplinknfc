import os
import subprocess
import logging
import argparse
import sys
import numpy as np
import qrcode
import trimesh

# --- Configurazione del Logging ---
logging.basicConfig(level=logging.INFO, format='[Python Script] %(levelname)s: %(message)s')
log = logging.getLogger('QR_3D_FLOW')

# --- Parametri di Modellazione Fissi (Costanti) ---
DEBOSS_DEPTH = 0.3        # Profondità di incisione (mm).
PENETRATION_MARGIN = 0.1  # Margine per garantire la penetrazione (mm).
# Altezza totale del "timbro" STL (Incisione + Penetrazione)
TOTAL_STAMP_HEIGHT = DEBOSS_DEPTH + PENETRATION_MARGIN
# Offset Z: sposta il timbro SOTTO Z=0 per garantire la sovrapposizione
Z_OFFSET = -PENETRATION_MARGIN

# --- Nomi File Temporanei (Interni allo script) ---
SCAD_SCRIPT_FILE = "temp_render_script.scad"
STL_STAMP_FILE = "temp_qr_stamp.stl"

# --- Funzione di Parsing Argomenti ---

def parse_arguments():
    """Analizza gli argomenti passati da riga di comando dal file JS."""
    parser = argparse.ArgumentParser(description="Genera un modello 3MF inciso con QR Code.")
    
    parser.add_argument('--input-3mf', required=True, help="Percorso completo al file 3MF di base.")
    parser.add_argument('--output-3mf', required=True, help="Percorso completo dove salvare il file 3MF di output.")
    parser.add_argument('--qr-data', required=True, help="Contenuto (URL) del QR Code da incidere.")
    parser.add_argument('--qr-size-mm', type=float, required=True, help="Dimensione lato desiderata (totale) del QR Code in mm.")

    return parser.parse_args()

# --- Logica di Generazione STL (Nuova) ---

def generate_qr_stl(args: argparse.Namespace) -> str:
    """
    Genera un solido STL del QR Code usando trimesh.
    Questo sostituisce la generazione SVG e l'estrusione in OpenSCAD.
    """
    log.info(f"Avvio generazione QR Code STL per: {args.qr_data[:30]}...")
    
    try:
        # 1. Genera la matrice QR Code
        # Usiamo un bordo (margin) fisso di 1 modulo.
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=1, # Calcoleremo la scala dopo
            border=1  # Margine in moduli
        )
        qr.add_data(args.qr_data)
        qr.make(fit=True)
        
        # Ottieni la matrice come array NumPy (True = Nero, False = Bianco)
        matrix = np.array(qr.get_matrix())
        n_modules = matrix.shape[0]
        log.info(f"Matrice QR generata: {n_modules}x{n_modules} moduli.")

        # 2. Calcola le dimensioni
        # Calcola la dimensione di un singolo modulo per raggiungere la qr_size_mm totale
        module_size_mm = args.qr_size_mm / n_modules

        # 3. Crea la mesh 3D da zero usando trimesh
        meshes = []
        # Calcola la posizione Z centrale per i box
        z_center = Z_OFFSET + (TOTAL_STAMP_HEIGHT / 2.0)
        
        # Itera su ogni modulo
        for r in range(n_modules):
            for c in range(n_modules):
                # Se il modulo è NERO (True), crea un box
                if matrix[r, c]:
                    # Calcola la posizione X, Y del centro del box
                    # (0,0) della matrice è in alto a sx, (0,0) 3D è al centro
                    x_pos = (c - n_modules / 2.0) * module_size_mm + (module_size_mm / 2.0)
                    # Inverti la Y perché la matrice cresce verso il basso, il 3D cresce verso l'alto
                    y_pos = -(r - n_modules / 2.0) * module_size_mm - (module_size_mm / 2.0)
                    
                    # Definisci il transform per posizionare il box
                    transform = trimesh.transformations.translation_matrix([x_pos, y_pos, z_center])
                    
                    # Crea il box
                    box = trimesh.creation.box(
                        extents=[module_size_mm, module_size_mm, TOTAL_STAMP_HEIGHT],
                        transform=transform
                    )
                    meshes.append(box)
        
        if not meshes:
            log.error("Nessun modulo trovato nel QR code, la mesh è vuota.")
            return None
            
        # 4. Combina tutti i box in una singola mesh
        combined_mesh = trimesh.util.concatenate(meshes)

        # 5. Applica la rotazione (flip)
        # Ruota di 180 gradi sull'asse X per ribaltare l'immagine
        # (necessario affinché il QR sia leggibile dal basso)
        flip_transform = trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0])
        combined_mesh.apply_transform(flip_transform)

        # 6. Esporta l'STL temporaneo
        stl_filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), STL_STAMP_FILE)
        combined_mesh.export(stl_filepath)
        
        log.info(f"File STL temporaneo generato: {stl_filepath}")
        return stl_filepath

    except Exception as e:
        log.error(f"Errore durante la generazione dell'STL del QR Code: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None

# --- Logica OpenSCAD (Semplificata) ---

def generate_scad_script(base_model_path: str, qr_stl_path: str):
    """
    Genera il file OpenSCAD (.scad) per la sottrazione booleana.
    Ora usa il file STL pre-generato.
    """
    
    # Assicura che i percorsi siano assoluti e con slash corretti per OpenSCAD
    base_model_path = os.path.abspath(base_model_path).replace("\\", "/")
    qr_stl_path = os.path.abspath(qr_stl_path).replace("\\", "/")

    scad_content = f"""
// --- OPERAZIONE FINALE (Boolean Semplice) ---
// Sottrai il timbro STL (pre-generato) dal modello base.

difference() {{
    // 1. Modello di base
    // Usa il percorso assoluto per robustezza
    import("{base_model_path}", convexity = 10);
    
    // 2. Sottrai il timbro QR (STL)
    // L'STL è già posizionato e scalato correttamente da Python,
    // includendo l'offset Z per la penetrazione.
    import("{qr_stl_path}", convexity = 10);
}}
"""
    # Scrivi lo script SCAD
    scad_filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), SCAD_SCRIPT_FILE)
    
    with open(scad_filepath, 'w') as f:
        f.write(scad_content)
    log.info(f"Script OpenSCAD (STL Boolean) generato in {scad_filepath}")
    return scad_filepath


def render_model_with_openscad(scad_filepath: str, output_filepath: str) -> bool:
    """
    Esegue il rendering del file .scad in .3mf usando OpenSCAD da riga di comando.
    (Questa funzione è identica al tuo script originale)
    """
    os.makedirs(os.path.dirname(output_filepath), exist_ok=True)
    
    command = [
        "openscad", 
        "-o", output_filepath, 
        scad_filepath
    ]
    
    log.info(f"Avvio rendering OpenSCAD: {' '.join(command)}")
    
    try:
        # Aumentiamo il timeout, le operazioni booleane su mesh possono essere lunghe
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=300)
        log.info(f"Modello finale esportato con successo in {output_filepath}")
        if result.stderr:
            log.warning(f"Output STDERR di OpenSCAD (potrebbe contenere warning): {result.stderr}")
        return True
        
    except subprocess.CalledProcessError as e:
        log.error(f"Errore OpenSCAD (Codice: {e.returncode}). STDERR: {e.stderr} STDOUT: {e.stdout}")
        return False
    except subprocess.TimeoutExpired as e:
        log.error(f"Timeout OpenSCAD ({e.timeout}s) scaduto. L'operazione booleana è troppo complessa?")
        log.error(f"STDERR: {e.stderr} STDOUT: {e.stdout}")
        return False
    except FileNotFoundError:
        log.error("Comando 'openscad' non trovato. Verifica l'installazione e il PATH.")
        return False

# --- Esecuzione Principale ---
def main():
    args = parse_arguments()
    
    stl_path = None
    scad_path = None
    
    try:
        # 1. Genera il file STL del timbro QR (Nuova logica)
        stl_path = generate_qr_stl(args)
        if not stl_path:
            log.error("Fallimento nella generazione del file STL. Uscita.")
            sys.exit(1)

        # 2. Genera lo script SCAD (Logica semplificata)
        scad_path = generate_scad_script(args.input_3mf, stl_path)
        
        # 3. Esegui il rendering 
        if not render_model_with_openscad(scad_path, args.output_3mf):
            sys.exit(1)
            
        log.info("Processo di modellazione 3D completato con successo.")

    finally:
        # 4. Pulizia file temporanei
        if scad_path and os.path.exists(scad_path):
            try:
                os.remove(scad_path)
                log.info(f"Pulito file SCAD temporaneo: {scad_path}")
            except OSError:
                pass 
        if stl_path and os.path.exists(stl_path):
            try:
                os.remove(stl_path)
                log.info(f"Pulito file STL temporaneo: {stl_path}")
            except OSError:
                pass 

if __name__ == "__main__":
    main()
