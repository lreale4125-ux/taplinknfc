#!/usr/bin/env python3
"""
make_qr_3mf_FIXED.py - Versione con posizionamento corretto
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

    def create_qr_stamp_mesh(self, matrix, module_size, base_center, height=0.4, z_pos=-0.1):
        """Crea timbro QR centrato rispetto alla base"""
        self.log("CREAZIONE TIMBRO QR 3D")
        boxes = []
        for y in range(matrix.shape[0]):
            for x in range(matrix.shape[1]):
                if matrix[y, x]:
                    # Coordinate RELATIVE al centro base
                    center_x = (x - matrix.shape[1]/2 + 0.5) * module_size + base_center[0]
                    center_y = (y - matrix.shape[0]/2 + 0.5) * module_size + base_center[1]
                    
                    box = trimesh.creation.box([module_size, module_size, height])
                    box.apply_translation([center_x, center_y, z_pos + height/2])
                    boxes.append(box)
        
        if not boxes:
            raise ValueError("QR vuoto!")
            
        qr_stamp = trimesh.util.concatenate(boxes)
        self.log(f"Timbro creato: {len(boxes)} moduli, bounds: {qr_stamp.bounds}")
        return qr_stamp

    def load_and_analyze_base(self, path):
        self.log(f"ANALISI BASE: {path}")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Base non trovata: {path}")
            
        mesh = trimesh.load_mesh(path)
        if isinstance(mesh, trimesh.Scene):
            self.log("Convertendo scena in mesh...")
            mesh = mesh.dump(concatenate=True) if hasattr(mesh, 'dump') else list(mesh.geometry.values())[0]
        
        # Calcola il centro della base
        base_center = mesh.centroid
        bounds = mesh.bounds
        
        self.log(f"BASE ANALISI:")
        self.log(f"  Vertici: {len(mesh.vertices)}")
        self.log(f"  Facce: {len(mesh.faces)}")
        self.log(f"  Bounds: {bounds}")
        self.log(f"  Centro: {base_center}")
        self.log(f"  Watertight: {mesh.is_watertight}")
        self.log(f"  Volume: {mesh.volume:.6f}")
        
        return mesh, base_center

    def boolean_operation(self, base, qr_stamp):
        """Esegue boolean difference con diagnostica"""
        self.log("=== TEST BOOLEAN ===")
        
        base_bounds, qr_bounds = base.bounds, qr_stamp.bounds
        self.log(f"Base bounds: {base_bounds}")
        self.log(f"QR bounds: {qr_bounds}")
        
        # Verifica overlap
        overlap = (base_bounds[0][0] < qr_bounds[1][0] and base_bounds[1][0] > qr_bounds[0][0] and
                  base_bounds[0][1] < qr_bounds[1][1] and base_bounds[1][1] > qr_bounds[0][1] and
                  base_bounds[0][2] < qr_bounds[1][2] and base_bounds[1][2] > qr_bounds[0][2])
        
        self.log(f"Overlap check: {overlap}")
        
        if not overlap:
            self.log("❌ NO OVERLAP - impossibile procedere")
            return base

        # Prova boolean difference
        self.log("Tentativo boolean difference...")
        try:
            result = trimesh.boolean.difference([base, qr_stamp])
            if result and len(result.vertices) > 0:
                self.log(f"✅ BOOLEAN OK: {len(result.vertices)} vertici")
                return result
            else:
                self.log("❌ BOOLEAN VUOTO")
        except Exception as e:
            self.log(f"❌ BOOLEAN FALLITO: {e}")

        return base

    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=22):
        try:
            self.log("🚀 INIZIO GENERAZIONE")
            
            # 1. Carica base e calcola centro
            base, base_center = self.load_and_analyze_base(input_3mf)
            
            # 2. Genera QR
            matrix, module_size = self.generate_qr_matrix(qr_data, qr_size_mm)
            
            # 3. Crea timbro CENTRATO sulla base
            qr_stamp = self.create_qr_stamp_mesh(matrix, module_size, base_center)
            
            # 4. Boolean operation
            result = self.boolean_operation(base, qr_stamp)
            
            # 5. Salva
            result.export(output_3mf)
            self.log(f"✅ Salvato: {output_3mf}")
            
            # 6. Salva debug
            debug_dir = os.path.join(os.path.dirname(output_3mf), "debug")
            os.makedirs(debug_dir, exist_ok=True)
            qr_stamp.export(os.path.join(debug_dir, "qr_stamp.stl"))
            base.export(os.path.join(debug_dir, "base.stl"))
            with open(os.path.join(debug_dir, "log.txt"), 'w') as f:
                f.write("\n".join(self.debug_log))
                
            self.log("🎉 COMPLETATO")
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
    
    print("=== VERSIONE CORRETTA - QR CENTRATO ===")
    generator = QR3MFGenerator()
    success = generator.generate(args.input_3mf, args.output_3mf, args.qr_data, args.qr_size_mm)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
