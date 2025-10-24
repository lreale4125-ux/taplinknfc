import argparse
import sys
import logging
import json
from typing import List, Tuple
from pathlib import Path

# Librerie installate con successo
import requests
from PIL import Image
import numpy as np
from skimage.draw import polygon as sk_polygon
from skimage.measure import find_contours
import shapely.geometry
import trimesh

# Configurazione Logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def fail(message: str) -> None:
    """Stampa un messaggio di errore e termina lo script."""
    print(f"[ERRORE] {message}", file=sys.stderr)
    sys.exit(1)

def get_qr_code(qr_data: str, size: int) -> Image.Image:
    """Ottiene il QR Code come immagine PNG da un servizio esterno."""
    try:
        response = requests.get(
            f"https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={qr_data}",
            stream=True
        )
        response.raise_for_status()
        return Image.open(response.raw).convert("L")
    except requests.exceptions.RequestException as e:
        fail(f"Errore durante il download del QR Code: {e}")
    except Exception as e:
        fail(f"Errore durante l'apertura dell'immagine QR: {e}")
    return Image.new("L", (size, size), color=255) # Fallback con immagine bianca se fallisce

# --- NUOVA FUNZIONE DI SCRITTURA 3MF CON TRIMESH ---

def write_3mf_with_trimesh(parts: List[Tuple[str, trimesh.Trimesh]], out_path: Path) -> None:
    """
    Scrive un 3MF utilizzando l'esportazione nativa di trimesh.
    Crea una Scene multi-parte e la salva come 3MF.
    """
    try:
        scene = trimesh.Scene()
        
        # Aggiunge ogni parte (nome, mesh) alla scena
        for name, mesh in parts:
            if mesh.vertices.size > 0:
                # Trimesh salva i nomi nel metadata, utile per gli slicer
                scene.add_geometry(mesh, geom_name=name)

        # Salva la scena come 3MF. Trimesh gestisce i colori/materiali di base 
        # e la struttura multi-oggetto.
        scene.export(file_obj=str(out_path), file_type='3mf')
        
    except Exception as e:
        fail(f"Impossibile salvare il 3MF in '{out_path}' usando trimesh: {e}")

# --- FINE NUOVA FUNZIONE ---

def create_qr_extrusion(qr_image: Image.Image, size_mm: float, extrusion_mm: float) -> trimesh.Trimesh:
    """
    Converte l'immagine QR in una mesh 3D estrusa.
    """
    logging.info("Creazione mesh di estrusione QR in corso...")
    
    img_array = np.array(qr_image)
    # 0 = Nero (modulo QR), 255 = Bianco (sfondo)
    mask = img_array < 128
    
    # 1. Trova i contorni dei moduli neri (il QR)
    # L'argomento level=0.5 separa il bianco dal nero (0 e 255)
    contours = find_contours(mask, level=0.5)

    if not contours:
        logging.warning("Nessun contorno QR trovato nell'immagine. Generazione di una mesh vuota.")
        return trimesh.Trimesh()

    # 2. Converti i contorni in poligoni Shapely
    polygons = []
    scale = size_mm / qr_image.size[0] # Scala pixel -> mm
    
    for contour in contours:
        # Trova il contorno esterno più vicino per un array Shapely
        if len(contour) < 3:
            continue
            
        # Scala le coordinate da pixel a mm
        points_mm = contour * scale
        
        # Inverte l'asse Y per allineare con Trimesh/Shapely
        points_mm[:, 0] = size_mm - points_mm[:, 0] 
        
        # Crea un poligono Shapely
        try:
            poly = shapely.geometry.Polygon(points_mm)
            
            # Applica una piccola semplificazione per pulire i bordi seghettati
            poly = poly.simplify(scale / 2)

            if poly.is_valid and poly.area > (scale * scale): # Filtra i poligoni troppo piccoli
                polygons.append(poly)
        except Exception as e:
            logging.warning(f"Errore nella creazione del poligono Shapely: {e}")
            
    if not polygons:
        logging.warning("Nessun poligono valido generato. Restituisce mesh vuota.")
        return trimesh.Trimesh()

    # Unisci tutti i poligoni in una singola MultiPolygon
    # Per evitare problemi di sovrapposizione si usa l'unione
    union_poly = shapely.geometry.MultiPolygon(polygons).buffer(0)
    
    # 3. Estrusione 3D
    try:
        # Estrude il poligono 2D nello spessore desiderato
        qr_extrusion = trimesh.creation.extrude_polygon(
            union_poly, 
            height=extrusion_mm
        )
        qr_extrusion.metadata['name'] = "qr_module"
        return qr_extrusion
    except Exception as e:
        fail(f"Errore durante l'estrusione della mesh QR: {e}")
        return trimesh.Trimesh()


def run_pipeline(args: argparse.Namespace) -> None:
    """Logica principale per la generazione del 3MF."""
    
    # 0) Preparazione percorsi e parametri
    qr_data = args.qr_data
    base_model_path = Path(args.input_3mf)
    output_3mf = Path(args.output_3mf)
    qr_size_mm = args.qr_size_mm
    qr_margin_mm = args.qr_margin_mm

    # Le immagini PNG/SVG saranno salvate nella stessa directory del 3MF
    output_dir = output_3mf.parent
    output_name = output_3mf.stem
    output_png = output_dir / f"{output_name}_qr.png"
    output_svg = output_dir / f"{output_name}_qr.svg"
    
    if not base_model_path.exists():
        fail(f"File di input 3MF non trovato: {base_model_path}")

    # --- Punti critici ---
    QR_MODULE_SIZE_PX = 1024  # Risoluzione alta per il QR Code
    QR_EXTRUSION_MM = 1.25     # Altezza standard per l'estrusione del codice
    
    print(f"[Python Script] \n=== REPORT ===")
    print(f"Modello: {base_model_path.name}")
    print(f"QR data: {qr_data[:50]}...")
    print(f"QR size richiesta = {qr_size_mm:.3f} mm, margine = {qr_margin_mm:.3f} mm")
    
    # 1) Download e salvataggio del QR Code
    qr_image = get_qr_code(qr_data, QR_MODULE_SIZE_PX)
    qr_image.save(output_png)
    logging.info(f"QR Code PNG salvato in: {output_png}")
    
    # 2) Importazione del modello base
    try:
        logging.info("Caricamento modello base 3MF...")
        base_model_scene = trimesh.load(str(base_model_path), file_type='3mf')
        # Se carica un solo oggetto, Trimesh lo ritorna direttamente, altrimenti è una Scene.
        if isinstance(base_model_scene, trimesh.Trimesh):
            base_model_mesh = base_model_scene
        elif isinstance(base_model_scene, trimesh.Scene):
            # Uniamo tutte le mesh nel 3MF in un unico oggetto per semplificare
            base_model_mesh = trimesh.util.concatenate(base_model_scene.geometry.values())
        else:
            fail(f"Tipo di oggetto non supportato per il modello base: {type(base_model_scene)}")
            
        base_model_mesh.metadata['name'] = "base_tag"
        logging.info(f"Modello base caricato con {len(base_model_mesh.vertices)} vertici.")
    except Exception as e:
        fail(f"Errore durante il caricamento di {base_model_path}: {e}")

    # 3) Creazione dell'estrusione QR
    qr_mesh = create_qr_extrusion(qr_image, qr_size_mm, QR_EXTRUSION_MM)
    if qr_mesh.vertices.size == 0:
        logging.warning("Mesh QR vuota. Il QR non verrà aggiunto al modello.")

    # 4) Calcolo della posizione del QR sul modello base
    # Assumiamo che la mesh base sia centrata (trimesh la centra all'importazione)
    
    # Trova il punto più basso (Z minima) del modello base per posizionare il QR
    base_bounds = base_model_mesh.bounds
    base_min_z = base_bounds[0, 2] # Minima Z
    
    # Calcola il centro del QR (per centrarlo)
    qr_center_offset = (qr_size_mm / 2) + qr_margin_mm

    # Sposta la base del QR mesh sulla superficie del modello base
    qr_mesh.apply_translation([0, 0, base_min_z])
    
    # Se il QR è più piccolo del modello, centrarlo in XY
    model_center_xy = base_model_mesh.centroid[:2]
    
    # Trimesh centra gli oggetti alla creazione. 
    # Sposta la mesh QR al centro XY del modello base.
    qr_mesh.apply_translation([
        model_center_xy[0] - qr_center_offset,
        model_center_xy[1] - qr_center_offset,
        0
    ])

    logging.info("Mesh QR posizionata sul modello base.")

    # 5) Unione delle parti (opzionale, ma utile per slicer che non gestiscono bene i booleani)
    # Raccogliamo le parti da salvare
    out_parts = [("base_tag", base_model_mesh)]
    if qr_mesh.vertices.size > 0:
        out_parts.append(("qr_module", qr_mesh))
        
    # 6) Scrivi 3MF via trimesh
    write_3mf_with_trimesh(out_parts, output_3mf)
    
    print(f"Output scritto in: {output_3mf}")
    print("===============")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Genera un file 3MF con un QR Code inciso/estruso.")
    parser.add_argument("--input-3mf", required=True, help="Percorso del modello base 3MF.")
    parser.add_argument("--output-3mf", required=True, help="Percorso di output per il file 3MF finale.")
    parser.add_argument("--qr-data", required=True, help="Stringa di dati per il QR Code (es. URL).")
    parser.add_argument("--qr-size-mm", type=float, default=22.0, help="Dimensione del lato del QR Code in mm.")
    parser.add_argument("--qr-margin-mm", type=float, default=1.5, help="Margine in mm attorno al QR Code (usato per l'allineamento).")
    
    args = parser.parse_args()
    
    run_pipeline(args)
