#!/usr/bin/env python3
"""
make_qr_3mf_MANUAL_25mm.py - Versione con dimensione MANUALE forzata
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

    def generate_qr_matrix_manual_size(self, data, target_size_mm=25):
        """Genera QR e FORZA manualmente la dimensione a 25mm"""
        self.log(f"GENERAZIONE QR FORZATO 25mm: {data}")
        
        # Genera QR normalmente
        qr = qrcode.QRCode(
            version=4,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=1,
            border=1
        )
        qr.add_data(data)
        qr.make(fit=True)
        matrix = np.array(qr.get_matrix(), dtype=bool)
        
        # FORZA la dimensione a 25mm ignorando il border
        # Usa solo i moduli dati (senza border bianco)
        module_size = target_size_mm / matrix.shape[0]
        
        self.log(f"QR moduli dati: {matrix.shape}")
        self.log(f"Module size forzato: {module_size:.3f}mm")
        self.log(f"Dimensione target: {target_size_mm}mm")
        
        return matrix, module_size

    def create_qr_embossed_mesh_manual(self, matrix, module_size, base_center, depth=0.3):
        """Crea QR con dimensione MANUALE forzata"""
        self.log("CREAZIONE QR DIMENSIONE FORZATA")
        self.log(f"Centro base: {base_center}")
        
        boxes = []
        
        # Crea solo i moduli dati (nessun border bianco)
        for y in range(matrix.shape[0]):
            for x in range(matrix.shape[1]):
                if matrix[y, x]:
                    # Coordinate centrate - FORZA 25mm
                    rel_x = (x - matrix.shape[1]/2 + 0.5) * module_size
                    rel_y = (y - matrix.shape[0]/2 + 0.5) * module_size
                    center_x = rel_x + base_center[0]
                    center_y = rel_y + base_center[1]
                    
                    box = trimesh.creation.box([module_size, module_size, depth])
                    box_z_position = depth / 2
                    box.apply_translation([center_x, center_y, box_z_position])
                    boxes.append(box)
        
        if not boxes:
            raise ValueError("Nessun modulo QR!")
            
        qr_embossed = trimesh.util.concatenate(boxes)
        
        # Calcola dimensione REALE
        qr_width = qr_embossed.bounds[1][0] - qr_embossed.bounds[0][0]
        qr_height = qr_embossed.bounds[1][1] - qr_embossed.bounds[0][1]
        
        self.log(f"QR creato: {len(boxes)} moduli")
        self.log(f"Dimensione QR REALE: {qr_width:.1f}x{qr_height:.1f}mm")
        self.log(f"QR bounds: {qr_embossed.bounds}")
        
        return qr_embossed

    def load_single_base(self, path):
        """Carica SOLO la mesh principale della base"""
        self.log(f"CARICAMENTO BASE: {path}")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Base non trovata: {path}")
            
        scene = trimesh.load_mesh(path)
        
        if isinstance(scene, trimesh.Scene):
            self.log(f"Scena con {len(scene.geometry)} oggetti - prendo solo il primo")
            base_mesh = list(scene.geometry.values())[0]
        else:
            base_mesh = scene
        
        base_center = base_mesh.centroid
        
        self.log("=== ANALISI BASE ===")
        self.log(f"Vertici: {len(base_mesh.vertices)}")
        self.log(f"Facce: {len(base_mesh.faces)}")
        self.log(f"Centro: {base_center}")
        
        return base_mesh, base_center

    def save_separate_objects(self, base, qr_embossed, output_path):
        """Salva base e QR come oggetti SEPARATI"""
        self.log("SALVATAGGIO OGGETTI SEPARATI")
        
        scene = trimesh.Scene()
        scene.add_geometry(base, node_name="base_portachiavi")
        scene.add_geometry(qr_embossed, node_name="qr_code_25mm")
        
        self.log(f"Scena creata con {len(scene.geometry)} oggetti separati")
        scene.export(output_path)
        return output_path

    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=25):
        try:
            self.log("🚀 INIZIO GENERAZIONE - DIMENSIONE MANUALE FORZATA")
            
            # 1. Carica base
            base, base_center = self.load_single_base(input_3mf)
            
            # 2. Genera QR e FORZA dimensione a 25mm
            matrix, module_size = self.generate_qr_matrix_manual_size(qr_data, qr_size_mm)
            
            # 3. Crea QR con dimensione forzata
            qr_embossed = self.create_qr_embossed_mesh_manual(matrix, module_size, base_center, depth=0.3)
            
            # 4. Salva come OGGETTI SEPARATI
            self.save_separate_objects(base, qr_embossed, output_3mf)
            
            self.log(f"✅ Salvato: {output_3mf}")
            self.log("🎉 COMPLETATO - Dimensione manuale forzata")
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
    
    print("=== VERSIONE DIMENSIONE MANUALE FORZATA ===")
    generator = QR3MFGenerator()
    success = generator.generate(args.input_3mf, args.output_3mf, args.qr_data, args.qr_size_mm)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
