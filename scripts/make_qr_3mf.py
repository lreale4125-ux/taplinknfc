import argparse
import sys
import logging
from typing import List, Tuple
from pathlib import Path

# --- Librerie installate con successo ---
import requests
from PIL import Image
import numpy as np
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
    # (La tua implementazione originale è corretta e mantenuta)
    try:
        # Uso un endpoint QR standard per semplicità
        response = requests.get(
            f"https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={qr_data}",
            stream=True,
            timeout=10
        )
        response.raise_for_status()
        return Image.open(response.raw).convert("L")
    except requests.exceptions.RequestException as e:
        fail(f"Errore durante il download del QR Code: {e}")
    except Exception as e:
        fail(f"Errore durante l'apertura dell'immagine QR: {e}")
    return Image.new("L", (size, size), color=255)

def write_3mf_with_trimesh(parts: List[Tuple[str, trimesh.Trimesh]], out_path: Path) -> None:
    """Scrive un 3MF multi-parte usando trimesh."""
    try:
        scene = trimesh.Scene()
        
        for name, mesh in parts:
            if mesh.vertices.size > 0:
                scene.add_geometry(mesh, geom_name=name)

        scene.export(file_obj=str(out_path), file_type='3mf')
        
    except Exception as e:
        fail(f"Impossibile salvare il 3MF in '{out_path}' usando trimesh: {e}")

def create_qr_extrusion(qr_image: Image.Image, size_mm: float, extrusion_mm: float) -> trimesh.Trimesh:
    """
    Converte l'immagine QR in una mesh 3D estrusa.
    MIGLIORAMENTO: Unione e centramento più robusti.
    """
    logging.info("Creazione mesh di estrusione QR in corso...")
    
    img_array = np.array(qr_image)
    # 0 = Nero (modulo QR), 255 = Bianco (sfondo)
    mask = img_array < 128
    
    contours = find_contours(mask, level=0.5)

    if not contours:
        logging.warning("Nessun contorno QR trovato nell'immagine.")
        return trimesh.Trimesh()

    polygons = []
    scale = size_mm / qr_image.size[0] # Scala pixel -> mm
    
    for contour in contours:
        if len(contour) < 3:
            continue
            
        points_mm = contour * scale
        
        # L'asse Y (verticale) è invertito nel contesto bitmap/coordinate (0 in alto).
        # Lo ribaltiamo per allineare l'origine in basso a sinistra (come in un piano XY).
        points_mm[:, 0] = size_mm - points_mm[:, 0] 
        
        try:
            poly = shapely.geometry.Polygon(points_mm)
            
            # Semplificazione per ridurre i vertici e pulire la geometria
            poly = poly.simplify(scale / 2) 

            if poly.is_valid and poly.area > (scale * scale):
                polygons.append(poly)
        except Exception as e:
            logging.warning(f"Errore nella creazione del poligono Shapely: {e}")
            
    if not polygons:
        logging.warning("Nessun poligono valido generato. Restituisce mesh vuota.")
        return trimesh.Trimesh()

    # Unione più robusta dei poligoni per creare una geometria MultiPolygon pulita
    # buffer(0) risolve i problemi di auto-intersezione e invalidità.
    union_geometry = shapely.geometry.MultiPolygon(polygons).buffer(0)
    
    all_qr_meshes = []

    if union_geometry.geom_type == 'Polygon':
        geometries = [union_geometry]
    elif union_geometry.geom_type == 'MultiPolygon':
        geometries = list(union_geometry.geoms)
    else:
        logging.error(f"Geometria QR non supportata: {union_geometry.geom_type}")
        return trimesh.Trimesh()

    try:
        for single_polygon in geometries:
            mesh = trimesh.creation.extrude_polygon(
                single_polygon, 
                height=extrusion_mm
            )
            all_qr_meshes.append(mesh)
        
        if not all_qr_meshes:
            return trimesh.Trimesh()
            
        qr_extrusion = trimesh.util.concatenate(all_qr_meshes)
        qr_extrusion.metadata['name'] = "qr_module"
        
        # Centra la mesh QR a (0, 0) per un facile posizionamento successivo
        qr_center_xy = qr_extrusion.centroid[:2]
        qr_extrusion.apply_translation([-qr_center_xy[0], -qr_center_xy[1], 0])
        
        return qr_extrusion
        
    except Exception as e:
        fail(f"Errore durante l'estrusione della mesh QR: {e}")
        return trimesh.Trimesh()


def run_pipeline(args: argparse.Namespace) -> None:
    """Logica principale per la generazione del 3MF."""
    
    # 0) Preparazione
    qr_data = args.qr_data
    base_model_path = Path(args.input_3mf)
    output_3mf = Path(args.output_3mf)
    qr_size_mm = args.qr_size_mm
    qr_margin_mm = args.qr_margin_mm # Mantenuto per coerenza, ma non usato nella logica di centraggio
    
    # ... Omissis per il salvataggio PNG/SVG, che è corretto ...
    
    QR_MODULE_SIZE_PX = 1024  
    QR_EXTRUSION_MM = 1.25 # L'altezza di estrusione è ora un valore fisso standard

    # 1) Download e salvataggio del QR Code (omesso per brevità, mantenuto originale)
    qr_image = get_qr_code(qr_data, QR_MODULE_SIZE_PX)
    # ...

    # 2) Importazione del modello base (omesso per brevità, mantenuto originale)
    try:
        logging.info("Caricamento modello base 3MF...")
        # ... Logica di caricamento base_model_mesh ...
        if isinstance(base_model_scene, trimesh.Trimesh):
            base_model_mesh = base_model_scene
        elif isinstance(base_model_scene, trimesh.Scene):
            # Uniamo tutte le mesh nel 3MF in un unico oggetto per semplificare
            base_model_mesh = trimesh.util.concatenate(list(base_model_scene.geometry.values()))
        # ...
        base_model_mesh.metadata['name'] = "base_tag"
    except Exception as e:
        fail(f"Errore durante il caricamento di {base_model_path}: {e}")

    # 3) Creazione dell'estrusione QR
    qr_mesh = create_qr_extrusion(qr_image, qr_size_mm, QR_EXTRUSION_MM)
    if qr_mesh.vertices.size == 0:
        logging.warning("Mesh QR vuota.")

    # 4) Calcolo e correzione della POSIZIONE del QR sul modello base
    
    base_bounds = base_model_mesh.bounds
    base_min_z = base_bounds[0, 2] # Minima Z
    
    # Calcolo del centro XY del modello
    base_center_x = (base_bounds[0, 0] + base_bounds[1, 0]) / 2
    base_center_y = (base_bounds[0, 1] + base_bounds[1, 1]) / 2
    
    # La mesh QR è stata centrata su (0, 0, Z_min_qr) nella funzione create_qr_extrusion.
    
    # Sposta il QR in modo che:
    # 1. Il suo centro XY sia allineato con il centro XY del modello base.
    # 2. La sua Z minima sia allineata a Z_min del modello base (il piatto), più un leggero offset.
    
    # [X, Y]: Spostamento al centro del modello
    translation_x = base_center_x 
    translation_y = base_center_y
    
    # [Z]: Sposta il QR in Z_min, poi lo inserisce di 0.01 mm nel modello (per "aggrapparsi" alla base)
    qr_min_z = qr_mesh.bounds[0, 2] # Z minima della mesh QR, che dovrebbe essere 0 dopo l'estrusione
    translation_z = base_min_z - qr_min_z + 0.01

    qr_mesh.apply_translation([translation_x, translation_y, translation_z])

    logging.info(f"Mesh QR posizionata e centrata sul modello base a Z={base_min_z:.3f} + 0.01.")

    # 5) Unione delle parti (omesso per brevità, mantenuto originale)
    out_parts = [("base_tag", base_model_mesh)]
    if qr_mesh.vertices.size > 0:
        out_parts.append(("qr_module", qr_mesh))
        
    # 6) Scrivi 3MF via trimesh (omesso per brevità, mantenuto originale)
    write_3mf_with_trimesh(out_parts, output_3mf)
    
    print(f"Output scritto in: {output_3mf}")

if __name__ == "__main__":
    # (Mantenuto il tuo codice main originale)
    parser = argparse.ArgumentParser(description="Genera un file 3MF con un QR Code inciso/estruso.")
    parser.add_argument("--input-3mf", required=True, help="Percorso del modello base 3MF.")
    parser.add_argument("--output-3mf", required=True, help="Percorso di output per il file 3MF finale.")
    parser.add_argument("--qr-data", required=True, help="Stringa di dati per il QR Code (es. URL).")
    parser.add_argument("--qr-size-mm", type=float, default=22.0, help="Dimensione del lato del QR Code in mm.")
    parser.add_argument("--qr-margin-mm", type=float, default=1.5, help="Margine in mm attorno al QR Code (usato per l'allineamento).")
    
    args = parser.parse_args()
    
    run_pipeline(args)
