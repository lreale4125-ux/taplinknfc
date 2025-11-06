import argparse
import sys
import logging
from typing import List, Tuple, Optional
from pathlib import Path
from PIL import Image

# ... (omissis: importazioni e funzioni load_existing_qr_image, write_3mf_with_trimesh, create_qr_extrusion rimangono uguali)
# ...
# La funzione download_qr_code non è più necessaria e può essere rimossa,
# ma la lascio commentata in caso volessi ripristinarla.
# def download_qr_code(qr_data: str, size: int) -> Image.Image:
#    # ...

def run_pipeline(args: argparse.Namespace) -> None:
    """Logica principale per la generazione del 3MF."""
    
    # 0) Preparazione
    qr_data = args.qr_data
    base_model_path = Path(args.input_3mf)
    output_3mf = Path(args.output_3mf)
    qr_size_mm = args.qr_size_mm
    
    QR_MODULE_SIZE_PX = 1024  
    QR_EXTRUSION_MM = 0.3 # Altezza standard

    print(f"[Python Script] \n=== REPORT ===")
    print(f"Modello: {base_model_path.name}")
    print(f"QR data: {qr_data[:50]}...")
    print(f"FlipZ attivo: {args.flipz}")

    # 1) Recupero del QR Code generato dagli script Node
    qr_image = load_existing_qr_image(output_3mf)
    
    # *** MODIFICA QUI: Termina con errore se l'immagine PNG non è stata caricata ***
    if qr_image is None:
        fail("Impossibile caricare il file PNG locale. Interruzione dell'esecuzione.")
        
    # 2) Importazione, Unione e Ribaltamento del Modello Base
    try:
        logging.info("Caricamento modello base 3MF...")
        
        # *** CORREZIONE: Usare loaded_data per evitare 'base_model_scene is not defined' ***
        loaded_data = trimesh.load(str(base_model_path), file_type='3mf')
        
        if isinstance(loaded_data, trimesh.Trimesh):
            base_model_mesh = loaded_data
        elif isinstance(loaded_data, trimesh.Scene):
            # Uniamo tutte le mesh in un unico oggetto per semplificare
            base_model_mesh = trimesh.util.concatenate(list(loaded_data.geometry.values()))
        else:
            fail(f"Tipo di oggetto non supportato per il modello base: {type(loaded_data)}")
            
        # Aggiunta la gestione del Ribaltamento Z (se flag --flipz è passato)
        if args.flipz:
            logging.info("Ribaltamento del modello base lungo l'asse Z.")
            tf = np.eye(4)
            tf[2, 2] = -1 
            base_model_mesh.apply_transform(tf)
            
        base_model_mesh.metadata['name'] = "base_tag"
        logging.info(f"Modello base caricato con {len(base_model_mesh.vertices)} vertici.")
        
    except Exception as e:
        fail(f"Errore durante il caricamento di {base_model_path}: {e}")

    # 3) Creazione dell'estrusione QR
    qr_mesh = create_qr_extrusion(qr_image, qr_size_mm, QR_EXTRUSION_MM)
    if qr_mesh.vertices.size == 0:
        logging.warning("Mesh QR vuota.")

    # 4) Calcolo e CORREZIONE della POSIZIONE (logica di centraggio migliorata)
    base_bounds = base_model_mesh.bounds
    base_min_z = base_bounds[0, 2] # Minima Z del modello base (il piano di stampa)
    
    # Calcolo del centro XY del modello
    base_center_x = (base_bounds[0, 0] + base_bounds[1, 0]) / 2
    base_center_y = (base_bounds[0, 1] + base_bounds[1, 1]) / 2
    
    # [X, Y]: Spostamento al centro del modello. La mesh QR è centrata a (0, 0)
    translation_x = base_center_x 
    translation_y = base_center_y
    
    # [Z]: Sposta il QR in Z_min, poi lo inserisce di 0.01 mm nel modello (incisione/aggancio)
    qr_min_z = qr_mesh.bounds[0, 2] 
    translation_z = base_min_z - qr_min_z + 0.01

    qr_mesh.apply_translation([translation_x, translation_y, translation_z])

    logging.info(f"Mesh QR posizionata e centrata sul modello base a Z={base_min_z:.3f} + 0.01.")

    # 5) Unione delle parti
    out_parts = [("base_tag", base_model_mesh)]
    if qr_mesh.vertices.size > 0:
        out_parts.append(("qr_module", qr_mesh))
        
    # 6) Scrivi 3MF via trimesh
    write_3mf_with_trimesh(out_parts, output_3mf)
    
    print(f"Output scritto in: {output_3mf}")
    print("===============")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Genera un file 3MF con un QR Code inciso/estruso.")
    parser.add_argument("--input-3mf", required=True, type=Path)
    parser.add_argument("--output-3mf", required=True, type=Path)
    parser.add_argument("--qr-data", required=True, type=str)
    parser.add_argument("--qr-size-mm", type=float, default=22.0)
    parser.add_argument("--qr-margin-mm", type=float, default=1.5)
    parser.add_argument("--flipz", action="store_true", help="Ribalta l'orientamento Z del modello base prima di posizionare il QR.") # <--- AGGIUNTO
    
    args = parser.parse_args()
    
    run_pipeline(args)
