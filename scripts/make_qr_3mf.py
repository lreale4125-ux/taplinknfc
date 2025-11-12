#!/usr/bin/env python3
"""
make_qr_3mf_FINAL.py - Versione ottimizzata per base CIRCOLARE
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

    def generate_qr_matrix(self, data, qr_size_mm=28):  # Aumentato a 28mm
        self.log(f"GENERAZIONE QR: {data}")
        qr = qrcode.QRCode(
            version=4,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=1,
            border=1  # Border ridotto per massimizzare
        )
        qr.add_data(data)
        qr.make(fit=True)
        matrix = np.array(qr.get_matrix(), dtype=bool)
        module_size = qr_size_mm / max(matrix.shape)
        self.log(f"QR: {matrix.shape} moduli, size: {module_size:.3f}mm")
        self.log(f"Dimensione totale QR: {qr_size_mm}mm")
        return matrix, module_size

    def calculate_circular_safe_size(self, base_center, base_vertices, margin_mm=2):
        """Calcola la dimensione massima per base CIRCOLARE"""
        # Calcola il raggio approssimativo della base circolare
        distances = np.linalg.norm(base_vertices - base_center, axis=1)
        radius = np.max(distances)
        diameter = radius * 2
        
        # Per un QR quadrato in un cerchio, la diagonale deve essere <= diametro
        # diagonale = lato * √2, quindi lato_max = diametro / √2
        max_safe_size = (diameter / np.sqrt(2)) - (2 * margin_mm)
        
        self.log(f"Base circolare - Diametro: {diameter:.1f}mm")
        self.log(f"QR size sicuro: {max_safe_size:.1f}mm")
        
        return max(max_safe_size, 20)  # Minimo 20mm

    def is_point_inside_circle(self, point, center, radius):
        """Controlla se un punto è dentro il cerchio"""
        distance = np.sqrt((point[0] - center[0])**2 + (point[1] - center[1])**2)
        return distance <= radius

    def create_qr_embossed_mesh(self, matrix, module_size, base_center, base_radius, depth=0.3):
        """Crea QR incastonato per base CIRCOLARE"""
        self.log("CREAZIONE QR PER BASE CIRCOLARE")
        self.log(f"Centro base: {base_center}")
        self.log(f"Raggio base: {base_radius:.1f}mm")
        self.log(f"Profondità incisione: {depth}mm")
        
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
                    
                    # Calcola i 4 angoli del modulo
                    mod_half = module_size / 2
                    corners = [
                        [center_x - mod_half, center_y - mod_half],  # angolo inferiore sinistro
                        [center_x + mod_half, center_y - mod_half],  # angolo inferiore destro
                        [center_x - mod_half, center_y + mod_half],  # angolo superiore sinistro
                        [center_x + mod_half, center_y + mod_half]   # angolo superiore destro
                    ]
                    
                    # Il modulo è dentro se TUTTI i corners sono dentro il cerchio
                    all_inside = all(
                        self.is_point_inside_circle(corner, base_center, base_radius) 
                        for corner in corners
                    )
                    
                    if all_inside:
                        modules_inside += 1
                        # Crea box che si ESTENDE verso il BASSO
                        box = trimesh.creation.box([module_size, module_size, depth])
                        box.apply_translation([center_x, center_y, -depth/2])
                        boxes.append(box)
                    else:
                        modules_outside += 1
        
        self.log(f"Moduli QR: {modules_inside} dentro base, {modules_outside} fuori base")
        
        if not boxes:
            raise ValueError("Nessun modulo QR dentro la base circolare!")
            
        qr_embossed = trimesh.util.concatenate(boxes)
        self.log(f"QR incastonato creato: {len(boxes)} moduli")
        self.log(f"QR bounds: {qr_embossed.bounds}")
        
        return qr_embossed

    def load_single_base(self, path):
        """Carica SOLO la mesh principale della base CIRCOLARE"""
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
        
        # Calcola il raggio della base circolare
        distances = np.linalg.norm(base_mesh.vertices[:, :2] - base_center[:2], axis=1)
        base_radius = np.max(distances)
        
        self.log("=== ANALISI BASE CIRCOLARE ===")
        self.log(f"Vertici: {len(base_mesh.vertices)}")
        self.log(f"Facce: {len(base_mesh.faces)}")
        self.log(f"Bounds: {bounds}")
        self.log(f"Centro: {base_center}")
        self.log(f"Raggio: {base_radius:.1f}mm")
        self.log(f"Diametro: {base_radius * 2:.1f}mm")
        self.log(f"Watertight: {base_mesh.is_watertight}")
        
        return base_mesh, base_center, base_radius, base_mesh.vertices

    def combine_meshes(self, base, qr_embossed):
        """Combina base e QR in una singola mesh"""
        self.log("COMBINAZIONE BASE + QR IN SINGOLA MESH")
        
        # Unisci le due mesh in una singola
        combined = trimesh.util.concatenate([base, qr_embossed])
        
        self.log(f"Mesh combinata: {len(combined.vertices)} vertici")
        return combined

    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=28):  # Default a 28mm
        try:
            self.log("🚀 INIZIO GENERAZIONE - BASE CIRCOLARE")
            
            # 1. Carica base CIRCOLARE
            base, base_center, base_radius, base_vertices = self.load_single_base(input_3mf)
            
            # 2. Calcola dimensione sicura per base CIRCOLARE
            safe_size = self.calculate_circular_safe_size(base_center, base_vertices, margin_mm=2)
            
            # Usa la dimensione minore tra quella richiesta e quella sicura
            actual_qr_size = min(qr_size_mm, safe_size)
            if actual_qr_size < qr_size_mm:
                self.log(f"⚠️  QR ridotto a {actual_qr_size}mm per la base circolare")
            else:
                self.log(f"✅ QR a dimensione massima: {actual_qr_size}mm")
            
            # 3. Genera QR
            matrix, module_size = self.generate_qr_matrix(qr_data, actual_qr_size)
            
            # 4. Crea QR incastonato per base CIRCOLARE
            qr_embossed = self.create_qr_embossed_mesh(matrix, module_size, base_center, base_radius, depth=0.3)
            
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
                
            self.log("🎉 COMPLETATO - QR ottimizzato per base circolare")
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
    parser.add_argument('--qr-size-mm', type=float, default=28)  # Default a 28mm
    
    args = parser.parse_args()
    
    print("=== VERSIONE OTTIMIZZATA PER BASE CIRCOLARE ===")
    generator = QR3MFGenerator()
    success = generator.generate(args.input_3mf, args.output_3mf, args.qr_data, args.qr_size_mm)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
