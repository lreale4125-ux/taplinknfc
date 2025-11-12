#!/usr/bin/env python3
"""
make_qr_3mf_CORRETTO.py - Versione con QR sulla superficie INFERIORE
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

    def generate_qr_matrix(self, data, qr_size_mm=25):
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
        self.log(f"Dimensione totale QR: {qr_size_mm}mm (25x25mm)")
        return matrix, module_size

    def create_qr_embossed_mesh(self, matrix, module_size, base_center, base_bounds, depth=0.3):
        """Crea QR sulla superficie INFERIORE della base (Z: -0.001 a 0.3)"""
        self.log("CREAZIONE QR SU SUPERFICIE INFERIORE")
        self.log(f"Centro base: {base_center}")
        self.log(f"Bounds base: {base_bounds}")
        self.log(f"Profondità incisione: {depth}mm")
        
        # Trova la coordinata Z della superficie INFERIORE della base
        base_bottom_z = base_bounds[0][2]  # Z minimo della base
        self.log(f"Superficie inferiore base (Z): {base_bottom_z}mm")
        
        boxes = []
        
        for y in range(matrix.shape[0]):
            for x in range(matrix.shape[1]):
                if matrix[y, x]:
                    # Coordinate RELATIVE al centro base
                    rel_x = (x - matrix.shape[1]/2 + 0.5) * module_size
                    rel_y = (y - matrix.shape[0]/2 + 0.5) * module_size
                    center_x = rel_x + base_center[0]
                    center_y = rel_y + base_center[1]
                    
                    # Crea box che si ESTENDE verso l'ALTO dalla superficie inferiore
                    # Posizione: la parte INFERIORE del QR è alla superficie inferiore della base
                    # Si estende verso l'ALTO (dentro la base)
                    box = trimesh.creation.box([module_size, module_size, depth])
                    
                    # Posiziona il QR: 
                    # - Centro X,Y come prima
                    # - Z: la parte inferiore del QR è alla superficie inferiore della base
                    # - Si estende verso Z positivo (dentro la base)
                    # Vogliamo Z-range: [-0.001, 0.3]
                    box_z_position = base_bottom_z + (depth / 2)
                    box.apply_translation([center_x, center_y, box_z_position])
                    boxes.append(box)
        
        if not boxes:
            raise ValueError("Nessun modulo QR!")
            
        qr_embossed = trimesh.util.concatenate(boxes)
        self.log(f"QR sulla superficie inferiore creato: {len(boxes)} moduli")
        self.log(f"QR bounds: {qr_embossed.bounds}")
        self.log(f"QR Z-range: [{qr_embossed.bounds[0][2]:.3f}, {qr_embossed.bounds[1][2]:.3f}]")
        
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
        self.log(f"Z range: [{bounds[0][2]:.3f}, {bounds[1][2]:.3f}]")
        
        return base_mesh, base_center, bounds

    def combine_meshes(self, base, qr_embossed):
        """Combina base e QR in una singola mesh"""
        self.log("COMBINAZIONE BASE + QR IN SINGOLA MESH")
        
        # Unisci le due mesh in una singola
        combined = trimesh.util.concatenate([base, qr_embossed])
        
        self.log(f"Mesh combinata: {len(combined.vertices)} vertici")
        return combined

    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=25):
        try:
            self.log("🚀 INIZIO GENERAZIONE - QR SU SUPERFICIE INFERIORE")
            self.log(f"Dimensione QR specificata: {qr_size_mm}mm")
            
            # 1. Carica base
            base, base_center, base_bounds = self.load_single_base(input_3mf)
            
            # 2. Genera QR con la dimensione specificata
            matrix, module_size = self.generate_qr_matrix(qr_data, qr_size_mm)
            
            # 3. Crea QR sulla superficie INFERIORE
            qr_embossed = self.create_qr_embossed_mesh(matrix, module_size, base_center, base_bounds, depth=0.3)
            
            # 4. Combina in UNA singola mesh
            final_mesh = self.combine_meshes(base, qr_embossed)
            
            # 5. Salva come 3MF
            final_mesh.export(output_3mf)
            self.log(f"✅ Salvato: {output_3mf}")
            
            self.log("🎉 COMPLETATO - QR sulla superficie inferiore")
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
    parser.add_argument('--qr-size-mm', type=float, default=25)
    
    args = parser.parse_args()
    
    print("=== VERSIONE CORRETTA - QR SU SUPERFICIE INFERIORE ===")
    generator = QR3MFGenerator()
    success = generator.generate(args.input_3mf, args.output_3mf, args.qr_data, args.qr_size_mm)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
