#!/usr/bin/env python3
"""
make_qr_3mf_FORZATO.py - Versione che forza la dimensione del QR
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
        """Genera QR FORZANDO una versione più grande"""
        self.log(f"GENERAZIONE QR: {data}")
        
        # Prova versioni crescenti del QR fino a raggiungere la dimensione desiderata
        for version in range(5, 10):  # Prova versioni da 5 a 9
            qr = qrcode.QRCode(
                version=version,  # FORZA versione specifica
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=1,
                border=1
            )
            qr.add_data(data)
            try:
                qr.make(fit=False)  # NON fare fit automatico
                matrix = np.array(qr.get_matrix(), dtype=bool)
                module_size = qr_size_mm / max(matrix.shape)
                
                self.log(f"QR versione {version}: {matrix.shape} moduli, size: {module_size:.3f}mm")
                self.log(f"Dimensione totale QR: {qr_size_mm}mm")
                
                return matrix, module_size
                
            except qrcode.exceptions.DataOverflowError:
                continue
        
        # Fallback: usa fit normale
        self.log("Fallback: usando fit automatico")
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=1,
            border=1
        )
        qr.add_data(data)
        qr.make(fit=True)
        matrix = np.array(qr.get_matrix(), dtype=bool)
        module_size = qr_size_mm / max(matrix.shape)
        
        self.log(f"QR auto: {matrix.shape} moduli, size: {module_size:.3f}mm")
        self.log(f"Dimensione totale QR: {qr_size_mm}mm")
        
        return matrix, module_size

    def create_qr_embossed_mesh(self, matrix, module_size, base_center, depth=0.3):
        """Crea QR forzando tutti i moduli"""
        self.log("CREAZIONE QR - TUTTI I MODULI")
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
                    
                    # Crea box
                    box = trimesh.creation.box([module_size, module_size, depth])
                    
                    # Posiziona il QR sulla superficie inferiore
                    box_z_position = depth / 2
                    box.apply_translation([center_x, center_y, box_z_position])
                    boxes.append(box)
        
        if not boxes:
            raise ValueError("Nessun modulo QR!")
            
        qr_embossed = trimesh.util.concatenate(boxes)
        
        # Calcola dimensione reale
        qr_width = qr_embossed.bounds[1][0] - qr_embossed.bounds[0][0]
        qr_height = qr_embossed.bounds[1][1] - qr_embossed.bounds[0][1]
        
        self.log(f"QR creato: {len(boxes)} moduli")
        self.log(f"Dimensione QR reale: {qr_width:.1f}x{qr_height:.1f}mm")
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
        scene.add_geometry(qr_embossed, node_name="qr_code_inciso")
        
        self.log(f"Scena creata con {len(scene.geometry)} oggetti separati")
        scene.export(output_path)
        return output_path

    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=25):
        try:
            self.log("🚀 INIZIO GENERAZIONE - QR FORZATO")
            self.log(f"Dimensione QR specificata: {qr_size_mm}mm")
            
            # 1. Carica base
            base, base_center = self.load_single_base(input_3mf)
            
            # 2. Genera QR FORZANDO versione più grande
            matrix, module_size = self.generate_qr_matrix(qr_data, qr_size_mm)
            
            # 3. Crea QR
            qr_embossed = self.create_qr_embossed_mesh(matrix, module_size, base_center, depth=0.3)
            
            # 4. Salva come OGGETTI SEPARATI
            self.save_separate_objects(base, qr_embossed, output_3mf)
            
            self.log(f"✅ Salvato: {output_3mf}")
            self.log("🎉 COMPLETATO - QR forzato a dimensione completa")
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
    
    print("=== VERSIONE CON QR FORZATO ===")
    generator = QR3MFGenerator()
    success = generator.generate(args.input_3mf, args.output_3mf, args.qr_data, args.qr_size_mm)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
