import argparse
import sys
import logging
from typing import List, Tuple, Optional, Union
from pathlib import Path

# --- Librerie installate con successo ---
import requests
from PIL import Image
import numpy as np
from skimage.measure import find_contours
import shapely.geometry
import trimesh

# --- Nuove dipendenze per SVG ---
# Assicurarsi che queste non siano avvolte in un try/except se sono installate
from svgpathtools import parse_path
from svgpathtools.path import Path as SVGPath
import xml.etree.ElementTree as ET

# Configurazione Logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def fail(message: str) -> None:
    """Stampa un messaggio di errore e termina lo script."""
    print(f"[ERRORE] {message}", file=sys.stderr)
    sys.exit(1)

# ************************************************************
# 1. Funzione per caricare il QR Code (ORA supporta SVG)
# ************************************************************
def load_qr_data(output_3mf: Path) -> Optional[Union[Path, Image.Image]]:
    """Cerca e carica il QR Code prima in SVG, poi in PNG."""

    base_dir = output_3mf.parent.parent
    file_stem = output_3mf.stem

    # 1. Tenta di caricare l'SVG
    svg_path = base_dir / "qr_svg" / f"{file_stem}.svg"
    if svg_path.exists():
        logging.info("Caricamento QR vettoriale da %s", svg_path)
        return svg_path

    logging.warning("QR vettoriale (SVG) non trovato in %s", svg_path.parent)

    # 2. Tenta di caricare il PNG come fallback (per retrocompatibilità)
    png_path = base_dir / "qr_png" / f"{file_stem}.png"
    if png_path.exists():
        logging.warning("Fallback: Caricamento QR raster (PNG) da %s", png_path)
        return Image.open(png_path).convert("L")

    return None

# ************************************************************
# 2. Funzione per salvare il 3MF (Invariata)
# ************************************************************
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

# ************************************************************
# 3. Funzione per creare la mesh QR (Supporta sia SVG che PNG)
# ************************************************************
def create_qr_extrusion(qr_data: Union[Path, Image.Image], size_mm: float, extrusion_mm: float) -> trimesh.Trimesh:
    """
    Converte il QR (sia SVG che PNG) in una mesh 3D estrusa.
    """
    logging.info("Creazione mesh di estrusione QR in corso...")

    polygons = []

    if isinstance(qr_data, Path) and qr_data.suffix.lower() == '.svg':
        # --- LOGICA SVG (VETTORIALE) ---
        try:
            tree = ET.parse(qr_data)
            root = tree.getroot()

            # Troviamo tutti gli elementi <path> (dove è contenuto il QR)
            all_paths = root.findall('.//{http://www.w3.org/2000/svg}path')

            if not all_paths:
                logging.error("Nessun tag <path> trovato nel file SVG.")
                return trimesh.Trimesh()

            # Estrai il primo percorso (di solito il QR completo)
            path_data = all_paths[0].get('d')

            # 1. Conversione path SVG a oggetti svgpathtools
            parsed_path = parse_path(path_data)
            
            # 2. Estrazione dei segmenti chiusi e Conversione a Poligono:
            
            # Correzione CRITICA: Usare .continuous_subpaths() per i percorsi complessi
            # generati dai QR, che sono composti da molti moduli chiusi.
            path_segments = parsed_path.continuous_subpaths() 

            # Tenta di estrarre la scala dalle dimensioni SVG
            svg_width_str = root.get('width', '0').replace('mm', '')
            try:
                svg_width = float(svg_width_str)
                scale = size_mm / svg_width
            except ValueError:
                # Fallback se le dimensioni SVG non sono chiare/presenti
                logging.warning("Dimensioni SVG non valide. Si assume che l'SVG sia scalato 1:1, la scala sarà 1.")
                scale = 1.0


            for sub_path in path_segments:
                # Il metodo .continuous_subpaths() restituisce percorsi chiusi.
                # L'oggetto Path ha il metodo .is_closed()
                if sub_path.is_closed(): 
                    # Converte i punti complessi in coordinate reali (x, y)
                    # Usiamo .vertices() che restituisce i punti di inizio/fine di ogni segmento.
                    # Per un poligono, questo è sufficiente.
                    points_complex = [p for p in sub_path.vertices()]
                    points_real = [(p.real * scale, p.imag * scale) for p in points_complex]

                    # Ribalta l'asse Y (assumendo l'origine in alto a sinistra per SVG)
                    # e converte a coordinate 3D Y positive verso l'alto (convenzione CAD)
                    points_real = [(x, size_mm - y) for x, y in points_real]

                    poly = shapely.geometry.Polygon(points_real)
                    poly = poly.simplify(0.01) # Semplificazione leggera
                    if poly.is_valid and poly.area > 0:
                        polygons.append(poly)


        except Exception as e:
            # Assicurati che svgpathtools sia installato!
            fail(f"Errore nella lettura/parsing del file SVG: {e}")
            return trimesh.Trimesh()

    elif isinstance(qr_data, Image.Image):
        # --- LOGICA PNG (RASTER) - INVARIATA ---
        logging.warning("Utilizzo logica PNG (meno precisa).")
        qr_image = qr_data

        # 1. Binarizzazione Esplicita (Correzione)
        threshold = 128
        qr_binarized = qr_image.point(lambda p: 255 if p > threshold else 0)
        img_array = np.array(qr_binarized)

        mask = img_array < 128

        contours = find_contours(mask, level=0.5)

        if not contours:
            logging.warning("Nessun contorno QR trovato nell'immagine PNG.")
            return trimesh.Trimesh()

        scale = size_mm / qr_image.size[0] # Scala pixel -> mm

        for contour in contours:
            if len(contour) < 3:
                continue

            points_mm = contour * scale

            # Ribalta l'asse Y per allineare l'origine in basso a sinistra (convenzione 3D)
            points_mm[:, 0] = size_mm - points_mm[:, 0]

            try:
                poly = shapely.geometry.Polygon(points_mm)
                poly = poly.simplify(scale)
                if poly.is_valid and poly.area > (scale * scale):
                    polygons.append(poly)
            except Exception as e:
                logging.warning(f"Errore nella creazione del poligono Shapely: {e}")

    else:
        fail("Tipo di dati QR non supportato. Né SVG né PNG trovati/validi.")


    if not polygons:
        logging.warning("Nessun poligono valido generato. Restituisce mesh vuota.")
        return trimesh.Trimesh()

    # --- ESTRUSIONE (Comune a SVG e PNG) ---
    # Unione per gestire i buchi e le geometrie complesse
    # NOTA: Buffer(0) è cruciale per pulire i MultiPolygons
    union_geometry = shapely.geometry.MultiPolygon(polygons).buffer(0)

    all_qr_meshes = []

    if union_geometry.geom_type == 'Polygon':
        geometries = [union_geometry]
    elif union_geometry.geom_type == 'MultiPolygon':
        geometries = list(union_geometry.geoms)
    else:
        logging.error(f"Geometria QR non supportata dopo l'unione: {union_geometry.geom_type}")
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

# ************************************************************
# 4. Logica Principale con Correzioni per INCISIONE SULLA BASE
# ************************************************************
def run_pipeline(args: argparse.Namespace) -> None:
    """Logica principale per la generazione del 3MF."""

    # 0) Preparazione
    qr_data_input = args.qr_data
    base_model_path = Path(args.input_3mf)
    output_3mf = Path(args.output_3mf)
    qr_size_mm = args.qr_size_mm

    QR_EXTRUSION_MM = 0.3 # Altezza standard dei moduli QR

    # Offset per l'intarsio/aggancio sulla base (0.01mm di invasione nel portachiavi)
    AGGANCIO_INCISIONE_MM = 0.01

    print(f"[Python Script] \n=== REPORT ===")
    print(f"Modello: {base_model_path.name}")
    print(f"QR data: {qr_data_input[:50]}...")
    print(f"FlipZ attivo: {args.flipz}")

    # 1) Recupero del QR Code (Prova SVG, poi PNG)
    qr_data = load_qr_data(output_3mf)

    if qr_data is None:
        fail("Impossibile caricare il QR Code (né SVG né PNG) locale. Interruzione.")

    # 2) Importazione, Unione e Ribaltamento del Modello Base (Invariata)
    try:
        logging.info("Caricamento modello base 3MF...")

        loaded_data = trimesh.load(str(base_model_path), file_type='3mf')

        if isinstance(loaded_data, trimesh.Trimesh):
            base_model_mesh = loaded_data
        elif isinstance(loaded_data, trimesh.Scene):
            base_model_mesh = trimesh.util.concatenate(list(loaded_data.geometry.values()))
        else:
            fail(f"Tipo di oggetto non supportato per il modello base: {type(loaded_data)}")

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
    qr_mesh = create_qr_extrusion(qr_data, qr_size_mm, QR_EXTRUSION_MM)
    if qr_mesh.vertices.size == 0:
        logging.warning("Mesh QR vuota.")

    # 4) CORREZIONE DELLA POSIZIONE Z per l'INCISIONE SULLA BASE INFERIORE (Invariata)
    base_bounds = base_model_mesh.bounds

    # 1. Troviamo la Z Minima (la superficie inferiore/base del portachiavi)
    base_min_z = base_bounds[0, 2]

    # Calcolo del centro XY del modello
    base_center_x = (base_bounds[0, 0] + base_bounds[1, 0]) / 2
    base_center_y = (base_bounds[0, 1] + base_bounds[1, 1]) / 2

    # [X, Y]: Spostamento al centro del modello.
    translation_x = base_center_x
    translation_y = base_center_y

    # [Z]: Calcoliamo l'altezza totale della mesh QR (0.3mm)
    qr_height = qr_mesh.bounds[1, 2] - qr_mesh.bounds[0, 2]

    # Calcolo della traslazione Z: Sposta il BOTTOM del QR a base_min_z meno l'altezza,
    # poi aggiunge l'aggancio. Risultato: il TOP del QR invade il portachiavi di 0.01mm.
    translation_z = base_min_z - qr_height + AGGANCIO_INCISIONE_MM

    qr_mesh.apply_translation([translation_x, translation_y, translation_z])

    logging.info(f"Mesh QR posizionata e centrata per **incisione sulla base**: Base QR a Z={translation_z:.3f}.")

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
    parser.add_argument("--flipz", action="store_true", help="Ribalta l'orientamento Z del modello base prima di posizionare il QR.")

    args = parser.parse_args()

    run_pipeline(args)
