import argparse
import sys
import logging
from typing import List, Tuple, Optional
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

def load_existing_qr_image(output_3mf: Path) -> Optional[Image.Image]:
    """Carica il QR già generato dagli script Node (formato PNG)."""

    try:
        # Output atteso: .../qrcodes/qr_3mf/<id>.3mf
        # QR fornito:  .../qrcodes/qr_png/<id>.png
        base_dir = output_3mf.parent.parent
        png_path = base_dir / "qr_png" / f"{output_3mf.stem}.png"

        if png_path.exists():
            logging.info("Caricamento QR locale da %s", png_path)
            return Image.open(png_path).convert("L")

        logging.warning("QR locale non trovato in %s", png_path)
    except Exception as exc:
        logging.error("Impossibile aprire il QR locale: %s", exc)

    return None


def download_qr_code(qr_data: str, size: int) -> Image.Image:
    """Fallback: scarica il QR Code da un servizio esterno."""
    
    try:
        # Uso un endpoint QR standard per semplicità
        response = requests.get(
            f"https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={qr_data}",
            stream=True,
            timeout=10
        )
        response.raise_for_status()
        return Image.open(response.raw).convert("L")
    
    except requests.exceptions.RequestException as exc:
        fail(f"Errore durante il download del QR Code: {exc}")
    except Exception as exc:
        fail(f"Errore durante l'apertura dell'immagine QR: {exc}")
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
    Include Binarizzazione e Semplificazione Aggressiva (Correzione).
    """
    logging.info("Creazione mesh di estrusione QR in corso...")
    
    # 1. Binarizzazione Esplicita (Correzione)
    # Assicura che l'immagine sia solo bianco e nero, rimuovendo artefatti
    threshold = 128
    qr_binarized = qr_image.point(lambda p: 255 if p > threshold else 0)
    img_array = np.array(qr_binarized) 
    
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
        
        # Ribalta l'asse Y per allineare l'origine in basso a sinistra (convenzione 3D)
        points_mm[:, 0] = size_mm - points_mm[:, 0] 
        
        try:
            poly = shapely.geometry.Polygon(points_mm)
            
            # 2. Semplificazione più Aggressiva (Correzione)
            # Usa 'scale' come tolleranza (prima era scale / 2) per contorni più puliti
            poly = poly.simplify(scale) 

            if poly.is_valid and poly.area > (scale * scale):
                polygons.append(poly)
        except Exception as e:
            logging.warning(f"Errore nella creazione del poligono Shapely: {e}")
            
    if not polygons:
        logging.warning("Nessun poligono valido generato. Restituisce mesh vuota.")
        return trimesh.Trimesh()

    # Unione più robusta dei poligoni per creare una geometria MultiPolygon pulita
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
    
    QR_MODULE_SIZE_PX = 1024  
    QR_EXTRUSION_MM = 0.3 # Altezza standard

    print(f"[Python Script] \n=== REPORT ===")
    print(f"Modello: {base_model_path.name}")
    print(f"QR data: {qr_data[:50]}...")
    print(f"FlipZ attivo: {args.flipz}")

     # 1) Recupero del QR Code generato dagli script Node
    qr_image = load_existing_qr_image(output_3mf)
    if qr_image is None:
        logging.info("Uso del fallback per il download del QR esterno.")
        qr_image = download_qr_code(qr_data, QR_MODULE_SIZE_PX)
    
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
