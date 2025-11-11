#!/usr/bin/env python3
"""
make_qr_3mf_FINAL.py - Versione con QR ruotato correttamente
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
        """Crea QR incastonato RUOTATO di 180° per combaciare con la base"""
        self.log("CREAZIONE QR INCASTONATO (RUOTATO)")
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
                    
                    # Crea box che si ESTENDE verso il BASSO
                    box = trimesh.creation.box([module_size, module_size, depth])
                    
                    # 🔄 ROTAZIONE: Ruota di 180° attorno all'asse Z per orientare correttamente
                    rotation = trimesh.transformations.rotation_matrix(np.pi, [0, 0, 1])
                    box.apply_transform(rotation)
                    
                    # Posiziona il QR (dopo la rotazione)
                    box.apply_translation([center_x, center_y, -depth/2])
                    boxes.append(box)
        
        if not boxes:
            raise ValueError("QR vuoto!")
            
        qr_embossed = trimesh.util.concatenate(boxes)
        self.log(f"QR incastonato creato: {len(boxes)} moduli")
        self.log(f"QR bounds: {qr_embossed.bounds}")
        self.log(f"QR center: {qr_embossed.centroid}")
        return qr_embossed

    def load_base_model(self, path):
        self.log(f"CARICAMENTO BASE: {path}")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Base non trovata: {path}")
            
        mesh = trimesh.load_mesh(path)
        if isinstance(mesh, trimesh.Scene):
            self.log("Convertendo scena in mesh...")
            # Prendi solo la PRIMA mesh dalla scena per evitare duplicati
            mesh = list(mesh.geometry.values())[0]
        
        base_center = mesh.centroid
        bounds = mesh.bounds
        
        self.log("=== ANALISI BASE ===")
        self.log(f
