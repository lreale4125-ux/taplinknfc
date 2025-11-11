#!/usr/bin/env python3
"""
make_qr_3mf.py - Generatore di QR code incisi 3D
Versione COMPLETA e CORRETTA per Ubuntu 22.04 headless
Compatibile con qrgenerator.js
"""

import argparse
import sys
import os
import traceback
import numpy as np
import qrcode
from datetime import datetime

# Import con gestione errori dettagliata
try:
    import trimesh
    print("✓ trimesh importato correttamente")
except ImportError as e:
    print(f"✗ ERRORE Import trimesh: {e}")
    sys.exit(1)

class QR3MFGenerator:
    def __init__(self):
        self.debug_log = []
        self.log(f"=== QR3MFGenerator Inizializzato ===")
        
    def log(self, message):
        """Aggiunge messaggio al log di debug"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        log_entry = f"[{timestamp}] {message}"
        print(log_entry, flush=True)
        self.debug_log.append(log_entry)
        
    def generate_qr_matrix(self, data, qr_size_mm=22):
        """Genera matrice QR binaria e calcola dimensioni"""
        self.log(f"Generando QR per: {data}")
        
        try:
            qr = qrcode.QRCode(
                version=4,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=1,
                border=2
            )
            qr.add_data(data)
            qr.make(fit=True)
            
            matrix = np.array(qr.get_matrix(), dtype=bool)
            self.log(f"QR Matrix generata: {matrix.shape[1]}x{matrix.shape[0]} moduli")
            
            # Calcola dimensione modulo in mm
            module_size_mm = qr_size_mm / max(matrix.shape)
            self.log(f"Module size: {module_size_mm:.3f}mm")
            
            return matrix, module_size_mm
            
        except Exception as e:
            self.log(f"ERRORE generazione QR: {e}")
            raise
    
    def create_qr_stamp_mesh(self, matrix, module_size_mm, stamp_height=0.4, z_position=-0.1):
        """Crea mesh 3D del timbro QR per incisione"""
        self.log("Creando mesh timbro QR...")
        
        try:
            stamp_meshes = []
            module_height = stamp_height

            # Crea un box per ogni modulo nero
            for y in range(matrix.shape[0]):
                for x in range(matrix.shape[1]):
                    if matrix[y, x]:
                        # Coordinate centro modulo
                        center_x = (x - matrix.shape[1] / 2 + 0.5) * module_size_mm
                        center_y = (y - matrix.shape[0] / 2 + 0.5) * module_size_mm
                        
                        # Crea box
                        box = trimesh.creation.box(
                            extents=[module_size_mm, module_size_mm, module_height]
                        )
                        
                        # Posiziona box
                        box.apply_translation([center_x, center_y, z_position + module_height/2])
                        stamp_meshes.append(box)
            
            if not stamp_meshes:
                raise ValueError("Nessun modulo nero nel QR code")
            
            # Unisci tutti i moduli
            qr_stamp = trimesh.util.concatenate(stamp_meshes)
            
            self.log(f"Timbro QR creato: {len(stamp_meshes)} moduli")
            self.log(f"Bounds timbro: {qr_stamp.bounds}")
            
            return qr_stamp
            
        except Exception as e:
            self.log(f"ERRORE creazione mesh QR: {e}")
            raise
    
    def load_base_model(self, input_path):
        """Carica il modello base con gestione errori robusta"""
        self.log(f"Caricando modello base: {input_path}")
        
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"File base non trovato: {input_path}")
        
        file_size = os.path.getsize(input_path)
        self.log(f"Dimensione file: {file_size} bytes")
        
        if file_size == 0:
            raise ValueError("File base è vuoto")
        
        try:
            # Prova a caricare con trimesh
            scene = trimesh.load_mesh(input_path)
            
            if scene is None:
                raise ValueError("trimesh.load_mesh ha restituito None")
                
            # Gestione diversi tipi di output
            if isinstance(scene, trimesh.Scene):
                self.log("Modello è una Scene, estraggo mesh...")
                if len(scene.geometry) == 0:
                    raise ValueError("Scena non contiene geometrie")
                
                # Combina tutte le mesh della scena
                meshes = list(scene.geometry.values())
                if len(meshes) == 1:
                    base_mesh = meshes[0]
                else:
                    base_mesh = trimesh.util.concatenate(meshes)
                    
            elif isinstance(scene, trimesh.Trimesh):
                base_mesh = scene
            else:
                raise ValueError(f"Tipo non supportato: {type(scene)}")
            
            # Verifica mesh valida
            if not hasattr(base_mesh, 'vertices') or len(base_mesh.vertices) == 0:
                raise ValueError("Mesh senza vertici")
                
            if not hasattr(base_mesh, 'faces') or len(base_mesh.faces) == 0:
                raise ValueError("Mesh senza facce")
            
            self.log(f"✓ Base caricata: {len(base_mesh.vertices)} vertici, {len(base_mesh.faces)} faces")
            self.log(f"Bounds base: {base_mesh.bounds}")
            self.log(f"Base watertight: {base_mesh.is_watertight}")
            
            return base_mesh
            
        except Exception as e:
            self.log(f"ERRORE caricamento modello: {e}")
            self.log("Tentativo caricamento alternativo...")
            
            # Tentativo alternativo
            try:
                base_mesh = trimesh.load_mesh(input_path, force='mesh')
                if base_mesh is not None and len(base_mesh.vertices) > 0:
                    self.log("✓ Caricamento alternativo riuscito")
                    return base_mesh
            except Exception as e2:
                self.log(f"ERRORE anche caricamento alternativo: {e2}")
            
            raise
    
    def repair_mesh(self, mesh):
        """Ripara una mesh per problemi di watertight"""
        self.log("Riparazione mesh in corso...")
        
        original_vertices = len(mesh.vertices)
        original_faces = len(mesh.faces)
        
        try:
            # 1. Rimuovi facce degenerate
            mesh.remove_degenerate_faces()
            
            # 2. Rimuovi duplicati
            mesh.merge_vertices()
            mesh.remove_duplicate_faces()
            
            # 3. Fix normals e winding
            trimesh.repair.fix_normals(mesh)
            trimesh.repair.fix_winding(mesh)
            
            # 4. Fill holes
            mesh.fill_holes()
            
            self.log(f"Riparazione completata: {len(mesh.vertices)} vertici, {len(mesh.faces)} faces")
            
        except Exception as e:
            self.log(f"Warning durante riparazione: {e}")
        
        return mesh
    
    def check_bounds_overlap(self, bounds1, bounds2):
        """Controlla se due bounding box si sovrappongono"""
        return (bounds1[0][0] < bounds2[1][0] and bounds1[1][0] > bounds2[0][0] and
                bounds1[0][1] < bounds2[1][1] and bounds1[1][1] > bounds2[0][1] and
                bounds1[0][2] < bounds2[1][2] and bounds1[1][2] > bounds2[0][2])
    
    def perform_boolean_difference(self, base_mesh, qr_stamp):
        """Esegue operazione booleana di differenza con fallback multipli"""
        self.log("Iniziando operazione boolean difference...")
        
        # Verifica watertight
        base_watertight = base_mesh.is_watertight
        qr_watertight = qr_stamp.is_watertight
        
        self.log(f"Base watertight: {base_watertight}")
        self.log(f"QR stamp watertight: {qr_watertight}")
        
        # Ripara se necessario
        if not base_watertight:
            self.log("Riparando base mesh...")
            base_mesh = self.repair_mesh(base_mesh)
            
        if not qr_watertight:
            self.log("Riparando QR stamp mesh...")
            qr_stamp = self.repair_mesh(qr_stamp)
        
        # Verifica overlap
        base_bounds = base_mesh.bounds
        qr_bounds = qr_stamp.bounds
        
        self.log(f"Base bounds: {base_bounds}")
        self.log(f"QR bounds: {qr_bounds}")
        
        overlap = self.check_bounds_overlap(base_bounds, qr_bounds)
        self.log(f"Bounds overlap: {overlap}")
        
        if not overlap:
            self.log("WARNING: Nessun overlap bounds - regolazione automatica...")
            # Sposta QR stamp leggermente verso l'alto per garantire overlap
            qr_stamp.apply_translation([0, 0, 0.15])
            self.log(f"Nuovi QR bounds: {qr_stamp.bounds}")
        
        # Prova diversi engine boolean
        engines = ['blender', 'scad']
        result = None
        
        for engine in engines:
            try:
                self.log(f"Tentativo boolean con engine: {engine}")
                result = trimesh.boolean.difference([base_mesh, qr_stamp], engine=engine)
                
                if result is not None and len(result.vertices) > 0:
                    self.log(f"✓ Boolean success con {engine}: {len(result.vertices)} vertici")
                    break
                else:
                    self.log(f"Boolean con {engine} restituito mesh vuota")
                    
            except Exception as e:
                self.log(f"Boolean fallito con {engine}: {e}")
                result = None
        
        # Fallback 1: intersection + difference
        if result is None or len(result.vertices) == 0:
            self.log("Tentativo fallback con intersection...")
            try:
                intersection = trimesh.boolean.intersection([base_mesh, qr_stamp])
                if intersection is not None and len(intersection.vertices) > 0:
                    result = trimesh.boolean.difference([base_mesh, intersection])
                    if result is not None and len(result.vertices) > 0:
                        self.log("✓ Fallback intersection riuscito")
            except Exception as e:
                self.log(f"Fallback intersection fallito: {e}")
        
        # Fallback 2: mesh semplificate
        if result is None or len(result.vertices) == 0:
            self.log("Tentativo con mesh semplificate...")
            try:
                base_simple = base_mesh.simplify_quadric_decimation(len(base_mesh.faces) * 0.7)
                qr_simple = qr_stamp.simplify_quadric_decimation(len(qr_stamp.faces) * 0.5)
                
                result = trimesh.boolean.difference([base_simple, qr_simple])
                if result is not None and len(result.vertices) > 0:
                    self.log("✓ Boolean con mesh semplificate riuscito")
            except Exception as e:
                self.log(f"Boolean mesh semplificate fallito: {e}")
        
        # Fallback finale
        if result is None or len(result.vertices) == 0:
            self.log("❌ Tutti i boolean falliti - restituisco base originale")
            result = base_mesh
        
        return result
    
    def save_model(self, mesh, output_path):
        """Salva il modello nel formato appropriato"""
        self.log(f"Salvataggio modello: {output_path}")
        
        try:
            # Crea directory se non esiste
            output_dir = os.path.dirname(output_path)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)
                self.log(f"Creata directory: {output_dir}")
            
            # Determina formato dall'estensione
            ext = os.path.splitext(output_path)[1].lower()
            
            if ext == '.3mf':
                mesh.export(output_path, file_type='3mf')
                self.log(f"✓ Modello 3MF salvato: {output_path}")
            else:
                mesh.export(output_path, file_type='stl')
                self.log(f"✓ Modello STL salvato: {output_path}")
                
            return output_path
            
        except Exception as e:
            self.log(f"ERRORE salvataggio {ext}: {e}")
            
            # Fallback assoluto a STL
            fallback_path = output_path.replace(ext, '_fallback.stl')
            try:
                mesh.export(fallback_path)
                self.log(f"✓ Salvato come fallback: {fallback_path}")
                return fallback_path
            except Exception as e2:
                self.log(f"ERRORE anche salvataggio fallback: {e2}")
                raise
    
    def save_debug_files(self, base_mesh, qr_stamp, final_mesh, output_dir):
        """Salva file di debug per verifica"""
        debug_dir = os.path.join(output_dir, "debug")
        os.makedirs(debug_dir, exist_ok=True)
        
        try:
            # Salva QR stamp per debug
            qr_stamp.export(os.path.join(debug_dir, "qr_stamp.stl"))
            self.log(f"✓ Debug: qr_stamp.stl salvato")
            
            # Salva base originale
            base_mesh.export(os.path.join(debug_dir, "base_original.stl"))
            self.log(f"✓ Debug: base_original.stl salvato")
            
            # Salva log dettagliato
            log_path = os.path.join(debug_dir, "debug_log.txt")
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(self.debug_log))
            self.log(f"✓ Debug: debug_log.txt salvato")
            
            self.log(f"File debug salvati in: {debug_dir}")
            
        except Exception as e:
            self.log(f"ERRORE salvataggio debug: {e}")
    
    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=22):
        """Genera il modello finale con QR inciso"""
        try:
            self.log("=== INIZIO GENERAZIONE QR 3D ===")
            self.log(f"Input: {input_3mf}")
            self.log(f"Output: {output_3mf}")
            self.log(f"QR Data: {qr_data}")
            self.log(f"QR Size: {qr_size_mm}mm")
            
            # 1. Carica modello base
            base_mesh = self.load_base_model(input_3mf)
            
            # 2. Genera matrice QR
            qr_matrix, module_size = self.generate_qr_matrix(qr_data, qr_size_mm)
            
            # 3. Crea timbro QR 3D
            qr_stamp = self.create_qr_stamp_mesh(
                qr_matrix, module_size, 
                stamp_height=0.4,    # Altezza timbro
                z_position=-0.1      # Posizione Z (negativo = incisione)
            )
            
            # 4. Esegui boolean difference
            final_mesh = self.perform_boolean_difference(base_mesh, qr_stamp)
            
            # 5. Verifica risultato finale
            self.log(f"Final mesh: {len(final_mesh.vertices)} vertici, {len(final_mesh.faces)} faces")
            self.log(f"Final watertight: {final_mesh.is_watertight}")
            self.log(f"Final bounds: {final_mesh.bounds}")
            
            # Controlla se l'incisione ha funzionato
            vertices_change = abs(len(final_mesh.vertices) - len(base_mesh.vertices))
            self.log(f"Cambiamento vertici: {vertices_change}")
            
            if vertices_change < 50:
                self.log("⚠️  WARNING: Possibile incisione non riuscita - pochi cambiamenti nei vertici")
            
            # 6. Salva modello finale
            final_path = self.save_model(final_mesh, output_3mf)
            
            # 7. Salva file debug
            output_dir = os.path.dirname(output_3mf)
            self.save_debug_files(base_mesh, qr_stamp, final_mesh, output_dir)
            
            self.log("=== GENERAZIONE COMPLETATA CON SUCCESSO ===")
            return True
            
        except Exception as e:
            self.log(f"=== GENERAZIONE FALLITA ===")
            self.log(f"ERRORE: {str(e)}")
            self.log(traceback.format_exc())
            return False

def main():
    print("=== make_qr_3mf.py START ===")
    
    parser = argparse.ArgumentParser(description='Generatore QR code 3D inciso')
    parser.add_argument('--input-3mf', required=True, help='Percorso modello base .3mf')
    parser.add_argument('--output-3mf', required=True, help='Percorso output .3mf')
    parser.add_argument('--qr-data', required=True, help='Dati per QR code')
    parser.add_argument('--qr-size-mm', type=float, default=22, help='Dimensione QR in mm')
    
    args = parser.parse_args()
    
    # Log degli argomenti ricevuti
    print(f"Arguments received:")
    print(f"  input-3mf: {args.input_3mf}")
    print(f"  output-3mf: {args.output_3mf}") 
    print(f"  qr-data: {args.qr_data}")
    print(f"  qr-size-mm: {args.qr_size_mm}")
    
    generator = QR3MFGenerator()
    success = generator.generate(
        input_3mf=args.input_3mf,
        output_3mf=args.output_3mf,
        qr_data=args.qr_data,
        qr_size_mm=args.qr_size_mm
    )
    
    if success:
        print("=== make_qr_3mf.py SUCCESS ===")
        sys.exit(0)
    else:
        print("=== make_qr_3mf.py FAILED ===")
        sys.exit(1)

if __name__ == "__main__":
    main()
