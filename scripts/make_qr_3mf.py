import trimesh
import numpy as np
from PIL import Image
import os
import logging

# Configura un logger per vedere i messaggi di trimesh (utile per il debug)
log = logging.getLogger('trimesh')
log.setLevel(logging.INFO)

# --- Parametri Globali ---
DEBOSS_DEPTH = 0.3  # Profondità dell'incisione in mm
TEXT_HEIGHT = 0.5   # Altezza del testo estruso in mm
PNG_SCALE = 0.8     # Scala l'immagine all'80% della dimensione X-Y del modello
TEXT_SCALE = 0.6    # Scala il testo al 60% della dimensione X-Y del modello

def load_model(filepath: str) -> trimesh.Trimesh | None:
    """
    Carica un modello 3D da un file.
    Supporta .3mf, .stl, .obj, ecc.
    """
    if not os.path.exists(filepath):
        log.error(f"File non trovato: {filepath}")
        return None
    
    try:
        # force='mesh' assicura di caricare la geometria mesh
        model = trimesh.load_mesh(filepath, force='mesh')
        
        # Se il modello ha più corpi, prova a unirli in uno unico.
        # Questo è cruciale per le operazioni booleane.
        if isinstance(model, trimesh.Scene):
            log.warning("Il file contiene una scena con più geometrie. Tento di unirle...")
            model = model.dump().sum()

        if not model.is_watertight:
            log.warning("Il modello caricato non è 'watertight'. Le operazioni booleane potrebbero fallire.")
            log.warning("Tento una riparazione di base...")
            model.fill_holes()
            model.fix_normals()

        log.info(f"Modello caricato con successo da {filepath}")
        log.info(f"Limiti del modello (Bounds): {model.bounds}")
        return model
    except Exception as e:
        log.error(f"Errore durante il caricamento di {filepath}: {e}")
        return None

def apply_png_deboss(model: trimesh.Trimesh, image_path: str, depth: float) -> trimesh.Trimesh:
    """
    Converte un'immagine PNG in un percorso 2D, lo estrude e lo sottrae
    dalla faccia superiore del modello (incisione/debossing).
    """
    try:
        # Carica l'immagine e convertila in un tracciato 2D
        # Le parti nere/opache dell'immagine diventeranno geometria
        img = Image.open(image_path)
        
        # Converti l'immagine in percorsi 2D (poligoni)
        # 'pitch' è la dimensione di un pixel nel mondo 3D. Lo scaleremo dopo.
        path_2d = trimesh.path.raster.raster_to_path(img, pitch=1.0)
        
        # --- Calcola Posizione e Scala ---
        
        # Centra il modello all'origine per facilitare i calcoli
        # (questo non è strettamente necessario se usiamo i bounds, ma è più pulito)
        model_center_xy = model.bounds.mean(axis=0)[:2]
        model_dims_xy = model.extents[:2]
        top_z = model.bounds[1, 2] # Z massima (faccia superiore)

        # Scala il percorso 2D per adattarlo al modello
        # Usa la dimensione più piccola (X o Y) per il scaling
        path_dims = path_2d.bounds[1] - path_2d.bounds[0]
        scale_factor = min(model_dims_xy * PNG_SCALE / path_dims)
        path_2d.apply_scale(scale_factor)
        
        # Centra il percorso 2D
        path_center = path_2d.bounds.mean(axis=0)
        path_2d.apply_translation(-path_center)
        
        # Sposta il percorso 2D al centro XY del modello
        path_2d.apply_translation(model_center_xy)

        # --- Crea il solido per la sottrazione ---
        
        # Estrundi il percorso 2D per creare un "timbro" 3D
        # Lo spessore (height) è la profondità dell'incisione
        deboss_stamp = path_2d.extrude(height=depth)
        
        # Posiziona il "timbro" sulla parte superiore del modello,
        # allineato per tagliare "verso il basso"
        deboss_stamp.apply_translation([0, 0, top_z - depth])

        log.info("Esecuzione dell'operazione booleana di 'differenza' (incisione)...")
        # Sottrai il timbro dal modello principale
        # 'engine='scad'' è un fallback se blender non è installato
        try:
            debossed_model = model.difference(deboss_stamp, engine=None) # Tenta prima il motore migliore
        except Exception as e_bool:
            log.warning(f"Boolean 'difference' fallito con il motore di default: {e_bool}")
            log.warning("Tento con il motore 'scad' (richiede OpenSCAD)...")
            try:
                debossed_model = model.difference(deboss_stamp, engine='scad')
            except Exception as e_scad:
                log.error(f"Anche il motore 'scad' è fallito: {e_scad}")
                log.error("Restituisco il modello originale. L'incisione non è stata applicata.")
                return model
        
        log.info("Incisione PNG applicata con successo.")
        return debossed_model
        
    except Exception as e:
        log.error(f"Errore durante l'applicazione dell'incisione PNG: {e}")
        return model

def add_text_extrusion(model: trimesh.Trimesh, text_content: str, height: float) -> trimesh.Trimesh:
    """
    Crea un testo 3D estruso e lo unisce alla faccia inferiore del modello.
    """
    try:
        # --- Crea i percorsi 2D per il testo ---
        # Usiamo trimesh.creation.text_to_path
        # Nota: questo richiede font installati sul sistema.
        # Per semplicità, usiamo i font di default.
        # 'font_size' è arbitrario, lo scaleremo dopo.
        text_paths = trimesh.creation.text_to_path(text=text_content, font_size=10)
        
        # 'text_to_path' restituisce un dizionario, uniamo tutti i percorsi
        path_2d = text_paths['path']

        # --- Calcola Posizione e Scala ---
        model_center_xy = model.bounds.mean(axis=0)[:2]
        model_dims_xy = model.extents[:2]
        bottom_z = model.bounds[0, 2] # Z minima (faccia inferiore)

        # Scala il percorso 2D per adattarlo al modello
        path_dims = path_2d.bounds[1] - path_2d.bounds[0]
        if np.any(path_dims == 0):
            log.warning("Dimensioni del percorso testo non valide, skipping text scaling.")
        else:
            scale_factor = min(model_dims_xy * TEXT_SCALE / path_dims)
            path_2d.apply_scale(scale_factor)
        
        # Centra il percorso 2D
        path_center = path_2d.bounds.mean(axis=0)
        path_2d.apply_translation(-path_center)
        
        # Sposta il percorso 2D al centro XY del modello
        path_2d.apply_translation(model_center_xy)

        # --- Crea il solido per l'unione ---
        text_mesh = path_2d.extrude(height=height)
        
        # Posiziona il testo sulla parte inferiore del modello,
        # estruso "verso l'esterno" (verso Z negativo)
        text_mesh.apply_translation([0, 0, bottom_z - height])

        log.info("Esecuzione dell'operazione booleana di 'unione' (testo)...")
        # Unisci il testo al modello principale
        try:
            combined_model = model.union(text_mesh, engine=None)
        except Exception as e_bool:
            log.warning(f"Boolean 'union' fallito con il motore di default: {e_bool}")
            log.warning("Tento con il motore 'scad' (richiede OpenSCAD)...")
            try:
                combined_model = model.union(text_mesh, engine='scad')
            except Exception as e_scad:
                log.error(f"Anche il motore 'scad' è fallito: {e_scad}")
                log.error("Restituisco il modello originale. Il testo non è stato aggiunto.")
                return model

        log.info("Testo estruso aggiunto con successo.")
        return combined_model

    except Exception as e:
        log.error(f"Errore durante l'aggiunta del testo estruso: {e}")
        return model

def export_model(model: trimesh.Trimesh, filepath: str):
    """
    Esporta il modello 3D finale in un file (es. .3mf o .stl).
    """
    try:
        # Assicura che la directory esista
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Esporta il file
        model.export(filepath)
        log.info(f"Modello finale esportato con successo in {filepath}")
    except Exception as e:
        log.error(f"Errore durante l'esportazione del modello: {e}")

# --- Esecuzione Principale ---
def main():
    """
    Funzione principale che orchestra l'intero processo.
    """
    # --- Configurazione dei file ---
    # Assicurati che questi file esistano nella stessa directory dello script
    # o specifica i percorsi completi.
    
    INPUT_MODEL = "input_model.3mf" 
    INPUT_IMAGE = "input_logo.png"   
    OUTPUT_MODEL = "output/final_model.3mf"
    TEXT_TO_ADD = "PROTOTYPE"

    # --- Creazione di file di esempio se non esistono ---
    if not os.path.exists(INPUT_MODEL):
        log.warning(f"{INPUT_MODEL} non trovato. Creo un modello box di esempio.")
        # Crea un box 50x50x10 mm
        model = trimesh.creation.box(bounds=[(-25, -25, 0), (25, 25, 10)])
        model.export(INPUT_MODEL)
    
    if not os.path.exists(INPUT_IMAGE):
        log.warning(f"{INPUT_IMAGE} non trovato. Creo un'immagine di esempio.")
        # Crea un'immagine 100x100 con un cerchio nero al centro
        img = Image.new('L', (100, 100), color='white')
        draw = ImageDraw.Draw(img)
        draw.ellipse((20, 20, 80, 80), fill='black')
        img.save(INPUT_IMAGE)
        
    # 1. Carica il modello
    model = load_model(INPUT_MODEL)
    if model is None:
        log.error("Caricamento del modello fallito. Interruzione.")
        return

    # 2. Applica l'incisione (deboss) del PNG
    model = apply_png_deboss(model, INPUT_IMAGE, DEBOSS_DEPTH)
    if model is None:
        log.error("Applicazione incisione fallita. Interruzione.")
        return
        
    # 3. Aggiungi il testo estruso sul lato opposto
    model = add_text_extrusion(model, TEXT_TO_ADD, TEXT_HEIGHT)
    if model is None:
        log.error("Aggiunta testo fallita. Interruzione.")
        return

    # 4. Esporta il modello finale
    export_model(model, OUTPUT_MODEL)
    
    log.info("Processo completato.")

if __name__ == "__main__":
    # Importa ImageDraw solo se necessario per creare l'immagine di esempio
    try:
        from PIL import ImageDraw
    except ImportError:
        log.warning("PIL.ImageDraw non trovato. Non posso creare un'immagine di esempio.")

    main()
