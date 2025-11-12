#!/usr/bin/env python3
"""
make_qr_3mf_FINAL.py - Versione con QR massimizzato e controllo geometria 2D reale
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

    def generate_qr_matrix(self, data, qr_size_mm=100):
        self.log(f"GENERAZIONE QR: {data}")
        qr = qrcode.QRCode(
            version=4,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=1,
            border=1
        )
        qr.add_data(data)
        qr.make(fit=True)
        matrix = np.array(qr.get_matrix(), dtype=bool)
        module_size = qr_size_mm / max(matrix.shape)
        self.log(f"QR: {matrix.shape} moduli, size: {module_size:.3f}mm")
        self.log(f"Dimensione totale QR: {qr_size_mm}mm")
        return matrix, module_size

    def calculate_safe_qr_size(self, base_bounds, margin_mm=0.5):
        """Calcola la dimensione massima del QR (basata sul bounding box)"""
        base_width = base_bounds[1][0] - base_bounds[0][0]
        base_height = base_bounds[1][1] - base_bounds[0][1]
        
        safe_size = min(base_width, base_height) - (2 * margin_mm)
        
        self.log(f"Base size (bounds): {base_width:.1f}x{base_height:.1f}mm")
        self.log(f"QR size sicuro (bounds): {safe_size:.1f}mm (margin: {margin_mm}mm)")
        
        # MODIFICA: Abbassato il minimo per modelli molto piccoli
        return max(safe_size, 5)  # Minimo 5mm

    # MODIFICA: Aggiunto 'base_mesh' come parametro
    def create_qr_embossed_mesh(self, base_mesh, matrix, module_size, base_center, base_bounds, depth=0.3):
        """Crea QR incastonato controllando la geometria 2D reale"""
        self.log("CREAZIONE QR INCASTONATO (Controllo Geometria Reale 2D)")
        self.log(f"Profondità incisione: {depth}mm")

        # --- NUOVO CONTROLLO GEOMETRIA 2D ---
        self.log("Creazione sezione 2D della base (footprint a Z=0.01)")
        # Creiamo una sezione 2D leggermente sopra Z=0 (che è il fondo)
        # per ottenere il footprint esatto della base.
        try:
            path2d = base_mesh.section(plane_origin=[0, 0, 0.01], plane_normal=[0, 0, 1])
            if path2d is None:
                raise ValueError("Impossibile creare la sezione 2D della base (path2d è None).")
            
            # Converti in un'entità Path2D planare
            planar_path, _ = path2d.to_planar()
            if not planar_path:
                 raise ValueError("La sezione 2D planare è vuota.")
            self.log(f"Sezione 2D creata con {len(planar_path.vertices)} vertici.")
        except Exception as e:
            self.log(f"💥 ERRORE durante la sezione 2D: {e}")
            self.log("Fallback al controllo bounding box (QR potrebbe sboradare!)")
            planar_path = None # Fallback
        # --- FINE CONTROLLO 2D ---

        boxes = []
        modules_inside = 0
        modules_outside = 0
        
        # Limiti del bounding box (usati solo in caso di fallback)
        base_min_x, base_min_y = base_bounds[0][0], base_bounds[0][1]
        base_max_x, base_max_y = base_bounds[1][0], base_bounds[1][1]

        for y in range(matrix.shape[0]):
            for x in range(matrix.shape[1]):
                if matrix[y, x]:
                    rel_x = (x - matrix.shape[1]/2 + 0.5) * module_size
                    rel_y = (y - matrix.shape[0]/2 + 0.5) * module_size
                    center_x = rel_x + base_center[0]
                    center_y = rel_y + base_center[1]
                    
                    # --- MODIFICA CONTROLLO 'inside_base' ---
                    if planar_path:
                        # Controllo GEOMETRIA REALE 2D
                        inside_base = planar_path.contains([center_x, center_y])
                    else:
                        # Controllo FALLBACK (Bounding Box)
                        inside_base = (center_x >= base_min_x and center_x <= base_max_x and
                                       center_y >= base_min_y and center_y <= base_max_y)
                    # --- FINE MODIFICA ---

                    if inside_base:
                        modules_inside += 1
                        box = trimesh.creation.box([module_size, module_size, depth])
                        # Sposta il box in posizione X, Y e Z (incassato)
                        box.apply_translation([center_x, center_y, -depth/2])
                        boxes.append(box)
                    else:
                        modules_outside += 1
        
        self.log(f"Moduli QR: {modules_inside} dentro mesh, {modules_outside} fuori mesh")
        
        if not boxes:
            raise ValueError("Nessun modulo QR dentro la base! (Controllare forma e dimensioni)")
            
        qr_embossed = trimesh.util.concatenate(boxes)
        self.log(f"QR incastonato creato: {len(boxes)} moduli")
        return qr_embossed

    def load_single_base(self, path):
        """Carica SOLO la mesh principale e la normalizza a Z=0"""
        self.log(f"CARICAMENTO BASE: {path}")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Base non trovata: {path}")
            
        scene = trimesh.load_mesh(path)
        
        if isinstance(scene, trimesh.Scene):
            self.log(f"Scena con {len(scene.geometry)} oggetti - prendo solo il primo")
            base_mesh = list(scene.geometry.values())[0]
        else:
            base_mesh = scene
        
        # --- MODIFICA: NORMALIZZAZIONE Z ---
        # Sposta la mesh in modo che la sua parte inferiore sia a Z=0
        min_z = base_mesh.bounds[0][2]
        if min_z != 0:
            base_mesh.apply_translation([0, 0, -min_z])
            self.log(f"Base normalizzata (traslata di {-min_z:.2f}mm in Z) a Z=0")
        else:
            self.log("Base già a Z=0.")
        # --- FINE MODIFICA ---

        base_center = base_mesh.centroid
        bounds = base_mesh.bounds # Ricalcola i bounds dopo la traslazione
        
        self.log("=== ANALISI BASE (Normalizzata) ===")
        self.log(f"Vertici: {len(base_mesh.vertices)}")
        self.log(f"Facce: {len(base_mesh.faces)}")
        self.log(f"Bounds: {bounds}")
        self.log(f"Centro: {base_center}")
        self.log(f"Watertight: {base_mesh.is_watertight}")
        
        return base_mesh, base_center, bounds

    def combine_meshes(self, base, qr_embossed):
        self.log("COMBINAZIONE BASE + QR IN SINGOLA MESH")
        combined = trimesh.util.concatenate([base, qr_embossed])
        self.log(f"Mesh combinata: {len(combined.vertices)} vertici")
        return combined

    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=100):
        try:
            self.log("🚀 INIZIO GENERAZIONE - QR MASSIMIZZATO (Controllo 2D)")
            
            # 1. Carica e NORMALIZZA la mesh
            base, base_center, base_bounds = self.load_single_base(input_3mf)
            
            # 2. Calcola dimensione sicura (basata su bounding box)
            safe_size = self.calculate_safe_qr_size(base_bounds, margin_mm=0.5)
            
            actual_qr_size = min(qr_size_mm, safe_size)
            if actual_qr_size < qr_size_mm:
                self.log(f"✅ QR massimizzato (bounds) a {actual_qr_size:.2f}mm")
            
            # 3. Genera QR
            matrix, module_size = self.generate_qr_matrix(qr_data, actual_qr_size)
            
            # 4. Crea QR incastonato (passando la mesh reale per controllo 2D)
            # MODIFICA: Passa 'base'
            qr_embossed = self.create_qr_embossed_mesh(base, matrix, module_size, base_center, base_bounds, depth=0.3)
            
            # 5. Combina
            final_mesh = self.combine_meshes(base, qr_embossed)
            
            # 6. Salva
            final_mesh.export(output_3mf)
            self.log(f"✅ Salvato: {output_3mf}")
            
            # 7. Salva debug
            debug_dir = os.path.join(os.path.dirname(output_3mf), "debug")
            os.makedirs(debug_dir, exist_ok=True)
            base.export(os.path.join(debug_dir, "base_normalized.stl"))
            qr_embossed.export(os.path.join(debug_dir, "qr_embossed_2D_checked.stl"))
            final_mesh.export(os.path.join(debug_dir, "combined.stl"))
            with open(os.path.join(debug_dir, "log.txt"), 'w') as f:
                f.write("\n".join(self.debug_log))
                
            self.log("🎉 COMPLETATO - QR massimizzato (2D) incorporato")
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
    parser.add_argument('--qr-size-mm', type=float, default=100)
    
    args = parser.parse_args()
    
    print("=== VERSIONE OTTIMIZZATA - QR MASSIMIZZATO (Controllo Geometria 2D) ===")
    generator = QR3MFGenerator()
    success = generator.generate(args.input_3mf, args.output_3mf, args.qr_data, args.qr_size_mm)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
