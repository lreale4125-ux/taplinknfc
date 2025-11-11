"""
make_qr_3mf_ALTERNATIVE.py - Versione con QR incastonato
"""

import argparse
import sys
import os
import traceback
import numpy as np
import qrcode
from datetime import datetime

try:
    import trimesh
    print("✓ trimesh importato")
except ImportError as e:
    print(f"✗ trimesh: {e}")
    sys.exit(1)

class QR3MFGenerator:
    def __init__(self):
        self.debug_log = []
        
    def log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        print(log_entry, flush=True)
        self.debug_log.append(log_entry)

    def generate_qr_matrix(self, data, qr_size_mm=22):
        self.log(f"GENERAZIONE QR: {data}")
        qr = qrcode.QRCode(version=4, error_correction=qrcode.constants.ERROR_CORRECT_M)
        qr.add_data(data)
        qr.make(fit=True)
        matrix = np.array(qr.get_matrix(), dtype=bool)
        module_size = qr_size_mm / max(matrix.shape)
        self.log(f"QR: {matrix.shape} moduli, size: {module_size:.3f}mm")
        return matrix, module_size

    def create_qr_embossed_mesh(self, matrix, module_size, base_center, depth=0.3):
        """Crea QR incastonato (estruso verso il basso)"""
        self.log("CREAZIONE QR INCASTONATO")
        self.log(f"Centro base: {base_center}")
        self.log(f"Profondità incisione: {depth}mm")
        
        boxes = []
        for y in range(matrix.shape[0]):
            for x in range(matrix.shape[1]):
                if matrix[y, x]:
                    # Coordinate RELATIVE al centro base
                    rel_x = (x - matrix.shape[1]/2 + 0.5) * module_size
                    rel_y = (y - matrix.shape[0]/2 + 0.5) * module_size
                    center_x = rel_x + base_center[0]
                    center_y = rel_y + base_center[1]
                    
                    # Crea box che si ESTENDE verso il BASSO dalla superficie
                    # Posizione Z: la parte superiore del QR è a Z=0, si estende verso Z negativo
                    box = trimesh.creation.box([module_size, module_size, depth])
                    box.apply_translation([center_x, center_y, -depth/2])  # Centrato su Z=0
                    boxes.append(box)
        
        if not boxes:
            raise ValueError("QR vuoto!")
            
        qr_embossed = trimesh.util.concatenate(boxes)
        self.log(f"QR incastonato creato: {len(boxes)} moduli")
        self.log(f"QR bounds: {qr_embossed.bounds}")
        return qr_embossed

    def load_base_model(self, path):
        self.log(f"CARICAMENTO BASE: {path}")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Base non trovata: {path}")
            
        mesh = trimesh.load_mesh(path)
        if isinstance(mesh, trimesh.Scene):
            self.log("Convertendo scena in mesh...")
            mesh = mesh.dump(concatenate=True) if hasattr(mesh, 'dump') else list(mesh.geometry.values())[0]
        
        base_center = mesh.centroid
        bounds = mesh.bounds
        
        self.log("=== ANALISI BASE ===")
        self.log(f"Vertici: {len(mesh.vertices)}")
        self.log(f"Facce: {len(mesh.faces)}")
        self.log(f"Bounds: {bounds}")
        self.log(f"Centro: {base_center}")
        self.log(f"Watertight: {mesh.is_watertight}")
        
        return mesh, base_center

    def combine_meshes_simple(self, base, qr_embossed):
        """Combina base e QR come oggetti separati nello stesso file 3MF"""
        self.log("COMBINAZIONE MESH SEMPLICE")
        
        # Crea una scena con entrambe le mesh
        scene = trimesh.Scene()
        scene.add_geometry(base, node_name="base")
        scene.add_geometry(qr_embossed, node_name="qr_embossed")
        
        self.log(f"Scene creata con {len(scene.geometry)} oggetti")
        return scene

    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=22):
        try:
            self.log("🚀 INIZIO GENERAZIONE - METODO INCASTONATO")
            
            # 1. Carica base
            base, base_center = self.load_base_model(input_3mf)
            
            # 2. Genera QR
            matrix, module_size = self.generate_qr_matrix(qr_data, qr_size_mm)
            
            # 3. Crea QR incastonato (estruso verso il basso)
            qr_embossed = self.create_qr_embossed_mesh(matrix, module_size, base_center, depth=0.3)
            
            # 4. Combina le mesh in una scena
            final_scene = self.combine_meshes_simple(base, qr_embossed)
            
            # 5. Salva come 3MF
            final_scene.export(output_3mf)
            self.log(f"✅ Salvato: {output_3mf}")
            
            # 6. Salva anche STL separati per debug
            debug_dir = os.path.join(os.path.dirname(output_3mf), "debug")
            os.makedirs(debug_dir, exist_ok=True)
            base.export(os.path.join(debug_dir, "base.stl"))
            qr_embossed.export(os.path.join(debug_dir, "qr_embossed.stl"))
            with open(os.path.join(debug_dir, "log.txt"), 'w') as f:
                f.write("\n".join(self.debug_log))
                
            self.log("🎉 COMPLETATO - QR incastonato creato")
            return True
            
        except Exception as e:
            self.log(f"💥 ERRORE: {e}")
            self.log(traceback.format_exc())
            return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-3mf', required=True)
    parser.add_argument('--output-3mf', required=True)
    parser.add_argument('--qr-data', required=True)
    parser.add_argument('--qr-size-mm', type=float, default=22)
    
    args = parser.parse_args()
    
    print("=== METODO INCASTONATO - QR COME OGGETTO SEPARATO ===")
    generator = QR3MFGenerator()
    success = generator.generate(args.input_3mf, args.output_3mf, args.qr_data, args.qr_size_mm)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
