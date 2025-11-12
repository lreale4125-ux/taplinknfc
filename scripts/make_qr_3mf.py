#!/usr/bin/env python3
"""
make_qr_3mf_FINAL.py - Versione con QR più grande e senza sborderi
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

    def generate_qr_matrix(self, data, qr_size_mm=25):  # Aumentato a 25mm
        self.log(f"GENERAZIONE QR: {data}")
        qr = qrcode.QRCode(
            version=4,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=1,
            border=1  # Ridotto il border per massimizzare l'area
        )
        qr.add_data(data)
        qr.make(fit=True)
        matrix = np.array(qr.get_matrix(), dtype=bool)
        module_size = qr_size_mm / max(matrix.shape)
        self.log(f"QR: {matrix.shape} moduli, size: {module_size:.3f}mm")
        self.log(f"Dimensione totale QR: {qr_size_mm}mm")
        return matrix, module_size

    def calculate_safe_qr_size(self, base_bounds, margin_mm=3):
        """Calcola la dimensione massima del QR che non sborda"""
        base_width = base_bounds[1][0] - base_bounds[0][0]  # larghezza base
        base_height = base_bounds[1][1] - base_bounds[0][1] # altezza base
        
        # Usa la dimensione minore tra larghezza e altezza, con margine
        safe_size = min(base_width, base_height) - (2 * margin_mm)
        
        self.log(f"Base size: {base_width:.1f}x{base_height:.1f}mm")
        self.log(f"QR size sicuro: {safe_size:.1f}mm (margin: {margin_mm}mm)")
        
        return max(safe_size, 15)  # Minimo 15mm

    def create_qr_embossed_mesh(self, matrix, module_size, base_center, base_bounds, depth=0.3):
        """Crea QR incastonato che non sborda"""
        self.log("CREAZIONE QR INCASTONATO SENZA SBORDI")
        self.log(f"Centro base: {base_center}")
        self.log(f"Profondità incisione: {depth}mm")
        
        # Calcola i limiti della base
        base_min_x, base_min_y = base_bounds[0][0], base_bounds[0][1]
        base_max_x, base_max_y = base_bounds[1][0], base_bounds[1][1]
        
        boxes = []
        modules_inside = 0
        modules_outside = 0
        
        for y in range(matrix.shape[0]):
            for x in range(matrix.shape[1]):
                if matrix[y, x]:
                    # Coordinate RELATIVE al centro base
                    rel_x = (x - matrix.shape[1]/2 + 0.5) * module_size
                    rel_y = (y - matrix.shape[0]/2 + 0.5) * module_size
                    center_x = rel_x + base_center[0]
                    center_y = rel_y + base_center[1]
                    
                    # Calcola i bounds di questo modulo
                    mod_half = module_size / 2
                    mod_min_x = center_x - mod_half
                    mod_max_x = center_x + mod_half
                    mod_min_y = center_y - mod_half
                    mod_max_y = center_y + mod_half
                    
                    # Controlla se il modulo è dentro la base
                    inside_base = (mod_min_x >= base_min_x and mod_max_x <= base_max_x and
                                  mod_min_y >= base_min_y and mod_max_y <= base_max_y)
                    
                    if inside_base:
                        modules_inside += 1
                        # Crea box che si ESTENDE verso il BASSO
                        box = trimesh.creation.box([module_size, module_size, depth])
                        box.apply_translation([center_x, center_y, -depth/2])
                        boxes.append(box)
                    else:
                        modules_outside += 1
        
        self.log(f"Moduli QR: {modules_inside} dentro base, {modules_outside} fuori base")
        
        if not boxes:
            raise ValueError("Nessun modulo QR dentro la base!")
            
        qr_embossed = trimesh.util.concatenate(boxes)
        self.log(f"QR incastonato creato: {len(boxes)} moduli")
        self.log(f"QR bounds: {qr_embossed.bounds}")
        
        # Verifica che il QR non sbordi
        qr_bounds = qr_embossed.bounds
        qr_inside = (qr_bounds[0][0] >= base_min_x and qr_bounds[1][0] <= base_max_x and
                     qr_bounds[0][1] >= base_min_y and qr_bounds[1][1] <= base_max_y)
        
        if not qr_inside:
            self.log("⚠️  WARNING: Il QR potrebbe sborare leggermente")
        else:
            self.log("✅ QR completamente dentro la base")
            
        return qr_embossed

    def load_single_base(self, path):
        """Carica SOLO la mesh principale della base"""
        self.log(f"CARICAMENTO BASE: {path}")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Base non trovata: {path}")
            
        scene = trimesh.load_mesh(path)
        
        # Se è una scena, prendi solo la PRIMA mesh (evita duplicati)
        if isinstance(scene, trimesh.Scene):
            self.log(f"Scena con {len(scene.geometry)} oggetti - prendo solo il primo")
            base_mesh = list(scene.geometry.values())[0]
        else:
            base_mesh = scene
        
        base_center = base_mesh.centroid
        bounds = base_mesh.bounds
        
        self.log("=== ANALISI BASE ===")
        self.log(f"Vertici: {len(base_mesh.vertices)}")
        self.log(f"Facce: {len(base_mesh.faces)}")
        self.log(f"Bounds: {bounds}")
        self.log(f"Centro: {base_center}")
        self.log(f"Watertight: {base_mesh.is_watertight}")
        
        return base_mesh, base_center, bounds

    def combine_meshes(self, base, qr_embossed):
        """Combina base e QR in una singola mesh"""
        self.log("COMBINAZIONE BASE + QR IN SINGOLA MESH")
        
        # Unisci le due mesh in una singola
        combined = trimesh.util.concatenate([base, qr_embossed])
        
        self.log(f"Mesh combinata: {len(combined.vertices)} vertici")
        return combined

    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=25):  # Default a 25mm
        try:
            self.log("🚀 INIZIO GENERAZIONE - QR OTTIMIZZATO")
            
            # 1. Carica SOLO la mesh principale
            base, base_center, base_bounds = self.load_single_base(input_3mf)
            
            # 2. Calcola dimensione sicura per il QR
            safe_size = self.calculate_safe_qr_size(base_bounds, margin_mm=3)
            
            # Usa la dimensione minore tra quella richiesta e quella sicura
            actual_qr_size = min(qr_size_mm, safe_size)
            if actual_qr_size < qr_size_mm:
                self.log(f"⚠️  QR ridotto a {actual_qr_size}mm per evitare sborderi")
            
            # 3. Genera QR
            matrix, module_size = self.generate_qr_matrix(qr_data, actual_qr_size)
            
            # 4. Crea QR incastonato che non sborda
            qr_embossed = self.create_qr_embossed_mesh(matrix, module_size, base_center, base_bounds, depth=0.3)
            
            # 5. Combina in UNA singola mesh
            final_mesh = self.combine_meshes(base, qr_embossed)
            
            # 6. Salva come 3MF
            final_mesh.export(output_3mf)
            self.log(f"✅ Salvato: {output_3mf}")
            
            # 7. Salva debug
            debug_dir = os.path.join(os.path.dirname(output_3mf), "debug")
            os.makedirs(debug_dir, exist_ok=True)
            base.export(os.path.join(debug_dir, "base.stl"))
            qr_embossed.export(os.path.join(debug_dir, "qr_embossed.stl"))
            final_mesh.export(os.path.join(debug_dir, "combined.stl"))
            with open(os.path.join(debug_dir, "log.txt"), 'w') as f:
                f.write("\n".join(self.debug_log))
                
            self.log("🎉 COMPLETATO - QR ottimizzato incorporato")
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
    parser.add_argument('--qr-size-mm', type=float, default=25)  # Default aumentato a 25mm
    
    args = parser.parse_args()
    
    print("=== VERSIONE OTTIMIZZATA - QR PIÙ GRANDE SENZA SBORDI ===")
    generator = QR3MFGenerator()
    success = generator.generate(args.input_3mf, args.output_3mf, args.qr_data, args.qr_size_mm)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
