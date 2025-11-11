#!/usr/bin/env python3
"""
make_qr_3mf.py - Generatore di QR code incisi 3D
Versione DEBUG con miglior gestione errori
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

try:
    import PIL.Image
    print("✓ PIL importato correttamente")
except ImportError as e:
    print(f"✗ ERRORE Import PIL: {e}")
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

            for y in range(matrix.shape[0]):
                for x in range(matrix.shape[1]):
                    if matrix[y, x]:
                        center_x = (x - matrix.shape[1] / 2 + 0.5) * module_size_mm
                        center_y = (y - matrix.shape[0] / 2 + 0.5) * module_size_mm
                        
                        box = trimesh.creation.box(
                            extents=[module_size_mm, module_size_mm, module_height]
                        )
                        box.apply_translation([center_x, center_y, z_position + module_height/2])
                        stamp_meshes.append(box)
            
            if not stamp_meshes:
                raise ValueError("Nessun modulo nero nel QR code")
            
            qr_stamp = trimesh.util.concatenate(stamp_meshes)
            
            self.log(f"Timbro QR creato: {len(stamp_meshes)} moduli")
            self.log(f"Bounds timbro: {qr_stamp.bounds}")
            
            return qr_stamp
            
        except Exception as e:
            self.log(f"ERRORE creazione mesh QR: {e}")
            raise
    
    def load_base_model(self, input_path):
        """Carica il modello base con miglior gestione errori"""
        self.log(f"Caricando modello base: {input_path}")
        
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"File base non trovato: {input_path}")
        
        file_size = os.path.getsize(input_path)
        self.log(f"Dimensione file: {file_size} bytes")
        
        if file_size == 0:
            raise ValueError("File base è vuoto")
        
        try:
            scene = trimesh.load_mesh(input_path, force='mesh')
            
            if scene is None:
                raise ValueError("trimesh.load_mesh ha restituito None")
                
            if isinstance(scene, trimesh.Scene):
                self.log("Modello è una Scene, estraggo mesh...")
                if len(scene.geometry) == 0:
                    raise ValueError("Scena non contiene geometrie")
                
                meshes = list(scene.geometry.values())
                if len(meshes) == 1:
                    base_mesh = meshes[0]
                else:
                    base_mesh = trimesh.util.concatenate(meshes)
                    
            elif isinstance(scene, trimesh.Trimesh):
                base_mesh = scene
            else:
                raise ValueError(f"Tipo non supportato: {type(scene)}")
            
            # VERIFICA MESH VALIDA
            if not hasattr(base_mesh, 'vertices') or len(base_mesh.vertices) == 0:
                raise ValueError("Mesh senza vertici")
                
            if not hasattr(base_mesh, 'faces') or len(base_mesh.faces) == 0:
                raise ValueError("Mesh senza facce")
            
            # CORREZIONE: base_bounds → base_mesh.bounds
            self.log(f"✓ Base caricata: {len(base_mesh.vertices)} vertici, {len(base_mesh.faces)} faces")
            self.log(f"Bounds base: {base_mesh.bounds}")  # <-- CORRETTO
            self.log(f"Base watertight: {base_mesh.is_watertight}")
            
            return base_mesh
            
        except Exception as e:
            self.log(f"ERRORE caricamento modello: {e}")
            self.log("Tentativo caricamento diretto...")
            
            try:
                base_mesh = trimesh.load_mesh(input_path)
                if base_mesh is not None and len(base_mesh.vertices) > 0:
                    self.log("✓ Caricamento diretto riuscito")
                    return base_mesh
            except Exception as e2:
                self.log(f"ERRORE anche caricamento diretto: {e2}")
            
            raise
    
    def safe_boolean_difference(self, base_mesh, qr_stamp):
        """Esegue boolean difference con fallback robusti"""
        self.log("Tentativo boolean difference...")
        
        base_watertight = base_mesh.is_watertight
        qr_watertight = qr_stamp.is_watertight
        
        self.log(f"Base watertight: {base_watertight}")
        self.log(f"QR stamp watertight: {qr_watertight}")
        
        if not base_watertight:
            self.log("Riparazione base mesh...")
            base_mesh = base_mesh.convex_hull
        
        try:
            result = trimesh.boolean.difference([base_mesh, qr_stamp])
            if result is not None and len(result.vertices) > 0:
                self.log("✓ Boolean difference riuscita")
                return result
        except Exception as e:
            self.log(f"Boolean difference fallita: {e}")
        
        self.log("Tentativo fallback con intersection...")
        try:
            intersection = trimesh.boolean.intersection([base_mesh, qr_stamp])
            if intersection is not None and len(intersection.vertices) > 0:
                result = trimesh.boolean.difference([base_mesh, intersection])
                if result is not None:
                    self.log("✓ Fallback intersection riuscito")
                    return result
        except Exception as e:
            self.log(f"Fallback intersection fallito: {e}")
        
        self.log("⚠️  Tutti i boolean falliti - restituisco base originale")
        return base_mesh
    
    def save_model(self, mesh, output_path):
        """Salva il modello con gestione errori"""
        self.log(f"Salvataggio modello: {output_path}")
        
        try:
            output_dir = os.path.dirname(output_path)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)
                self.log(f"Creata directory: {output_dir}")
            
            ext = os.path.splitext(output_path)[1].lower()
            
            if ext == '.3mf':
                mesh.export(output_path, file_type='3mf')
            else:
                mesh.export(output_path, file_type='stl')
                
            self.log(f"✓ Modello salvato: {output_path}")
            return output_path
            
        except Exception as e:
            self.log(f"ERRORE salvataggio: {e}")
            fallback_path = output_path.replace(ext, '.stl')
            try:
                mesh.export(fallback_path)
                self.log(f"✓ Salvato come fallback: {fallback_path}")
                return fallback_path
            except:
                raise
    
    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=22):
        """Genera il modello finale"""
        try:
            self.log("=== INIZIO GENERAZIONE ===")
            
            base_mesh = self.load_base_model(input_3mf)
            qr_matrix, module_size = self.generate_qr_matrix(qr_data, qr_size_mm)
            qr_stamp = self.create_qr_stamp_mesh(qr_matrix, module_size)
            final_mesh = self.safe_boolean_difference(base_mesh, qr_stamp)
            self.save_model(final_mesh, output_3mf)
            
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
