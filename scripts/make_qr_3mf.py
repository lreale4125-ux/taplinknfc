#!/usr/bin/env python3
"""
make_qr_3mf.py - Generatore di QR code incisi 3D
Compatibile con qrgenerator.js - Flusso headless per Ubuntu 22.04
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
    TRIMESH_AVAILABLE = True
except ImportError:
    TRIMESH_AVAILABLE = False
    print("ERROR: trimesh non disponibile. Installa con: pip install trimesh")
    sys.exit(1)

try:
    import py3mf
    PY3MF_AVAILABLE = True
except ImportError:
    PY3MF_AVAILABLE = False
    print("WARNING: py3mf non disponibile. Userò STL per export")

class QR3MFGenerator:
    def __init__(self):
        self.debug_log = []
        self.log(f"=== QR3MFGenerator Inizializzato ===")
        
    def log(self, message):
        """Aggiunge messaggio al log di debug"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        log_entry = f"[{timestamp}] {message}"
        print(log_entry)
        self.debug_log.append(log_entry)
        
    def generate_qr_matrix(self, data, qr_size_mm=22):
        """Genera matrice QR binaria e calcola dimensioni"""
        self.log(f"Generando QR per: {data[:50]}...")
        
        qr = qrcode.QRCode(
            version=4,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=1,
            border=2
        )
        qr.add_data(data)
        qr.make(fit=True)
        
        matrix = np.array(qr.get_matrix(), dtype=bool)
        self.log(f"QR Matrix: {matrix.shape[1]}x{matrix.shape[0]} moduli")
        
        # Calcola dimensione modulo in mm
        module_size_mm = qr_size_mm / max(matrix.shape)
        self.log(f"Module size: {module_size_mm:.3f}mm")
        
        return matrix, module_size_mm
    
    def create_qr_stamp_mesh(self, matrix, module_size_mm, stamp_height=0.4, z_position=-0.1):
        """Crea mesh 3D del timbro QR per incisione"""
        self.log("Creando mesh timbro QR...")
        
        stamp_meshes = []
        module_height = stamp_height
        
        # Crea un box per ogni modulo nero
        for y in range(matrix.shape[0]):
            for x in range(matrix.shape[1]):
                if matrix[y, x]:
                    # Coordinate centro modulo
                    center_x = (x - matrix.shape[1] / 2 + 0.5) * module_size_mm
                    center_y = (y - matrix.shape[0] / 2 + 0.5) * module_size_mm
                    
                    # Crea box
                    box = trimesh.creation.box(
                        extents=[module_size_mm, module_size_mm, module_height]
                    )
                    
                    # Posiziona box
                    box.apply_translation([center_x, center_y, z_position + module_height/2])
                    stamp_meshes.append(box)
        
        if not stamp_meshes:
            raise ValueError("Nessun modulo nero nel QR code")
        
        # Unisci tutti i moduli
        qr_stamp = trimesh.util.concatenate(stamp_meshes)
        
        self.log(f"Timbro QR creato: {len(stamp_meshes)} moduli")
        self.log(f"Bounds timbro: {qr_stamp.bounds}")
        
        return qr_stamp
    
    def load_base_model(self, input_3mf_path):
        """Carica il modello base 3MF"""
        self.log(f"Caricando modello base: {input_3mf_path}")
        
        if not os.path.exists(input_3mf_path):
            raise FileNotFoundError(f"File base non trovato: {input_3mf_path}")
        
        try:
            # Prova a caricare come 3MF
            scene = trimesh.load_mesh(input_3mf_path)
            
            # Se è una scena, prendi la prima mesh
            if isinstance(scene, trimesh.Scene):
                if len(scene.geometry) == 0:
                    raise ValueError("Scena 3MF vuota")
                base_mesh = list(scene.geometry.values())[0]
            else:
                base_mesh = scene
                
            # Converti in mesh se è PointCloud o altro
            if not hasattr(base_mesh, 'faces'):
                raise ValueError("Il modello base non contiene mesh valida")
                
        except Exception as e:
            self.log(f"Errore caricamento 3MF: {e}")
            # Fallback: prova a caricare come STL
            try:
                base_mesh = trimesh.load_mesh(input_3mf_path)
                self.log("Caricato come STL fallback")
            except:
                raise ValueError(f"Impossibile caricare il modello base: {e}")
        
        self.log(f"Base caricata: {len(base_mesh.vertices)} vertici, {len(base_mesh.faces)} faces")
        self.log(f"Bounds base: {base_mesh.bounds}")
        
        return base_mesh
    
    def perform_boolean_difference(self, base_mesh, qr_stamp):
        """Esegue operazione booleana di differenza"""
        self.log("Eseguendo boolean difference...")
        
        # Verifica watertight
        base_watertight = base_mesh.is_watertight
        qr_watertight = qr_stamp.is_watertight
        
        self.log(f"Base watertight: {base_watertight}")
        self.log(f"QR stamp watertight: {qr_watertight}")
        
        if not base_watertight:
            self.log("Riparando base mesh...")
            base_mesh = self.repair_mesh(base_mesh)
            
        if not qr_watertight:
            self.log("Riparando QR stamp mesh...")
            qr_stamp = self.repair_mesh(qr_stamp)
        
        # Verifica overlap bounds
        base_bounds = base_mesh.bounds
        qr_bounds = qr_stamp.bounds
        
        self.log(f"Base bounds: {base_bounds}")
        self.log(f"QR bounds: {qr_bounds}")
        
        # Controlla se c'è overlap sull'asse Z
        z_overlap = (qr_bounds[1][2] > base_bounds[0][2]) and (qr_bounds[0][2] < base_bounds[1][2])
        self.log(f"Overlap Z: {z_overlap}")
        
        if not z_overlap:
            self.log("WARNING: Nessun overlap sull'asse Z - incisione potrebbe non funzionare")
        
        try:
            # Esegui differenza booleana
            result = trimesh.boolean.difference([base_mesh, qr_stamp], engine='blender')
            
            if result is None:
                raise ValueError("Boolean difference ha restituito None")
                
            if len(result.vertices) == 0:
                raise ValueError("Mesh risultante vuota")
                
            self.log(f"Boolean success: {len(result.vertices)} vertici, {len(result.faces)} faces")
            
        except Exception as e:
            self.log(f"Boolean difference fallita: {e}")
            self.log("Tentativo fallback: unione e riparazione...")
            
            # Fallback: prova a fare un'operazione più semplice
            result = self.boolean_fallback(base_mesh, qr_stamp)
        
        return result
    
    def boolean_fallback(self, base_mesh, qr_stamp):
        """Fallback per boolean difference problematiche"""
        self.log("Usando fallback boolean...")
        
        # Prova a ridurre la complessità del QR stamp
        qr_simple = qr_stamp.simplify_quadric_decimation(
            len(qr_stamp.faces) * 0.5
        )
        
        # Ripara entrambe le mesh
        base_repaired = self.repair_mesh(base_mesh)
        qr_repaired = self.repair_mesh(qr_simple)
        
        # Prova differenza con mesh riparate
        result = trimesh.boolean.difference([base_repaired, qr_repaired])
        
        if result is None or len(result.vertices) == 0:
            self.log("ERROR: Fallback boolean fallito - restituisco base originale")
            return base_mesh
            
        return result
    
    def repair_mesh(self, mesh):
        """Ripara una mesh per renderla watertight"""
        self.log("Riparando mesh...")
        
        # Fill holes
        mesh.fill_holes()
        
        # Fix normals
        trimesh.repair.fix_normals(mesh)
        
        # Fix winding
        trimesh.repair.fix_winding(mesh)
        
        # Remove duplicate vertices
        mesh.remove_duplicate_faces()
        mesh.remove_degenerate_faces()
        
        return mesh
    
    def save_model(self, mesh, output_path, format='3mf'):
        """Salva il modello nel formato richiesto"""
        self.log(f"Salvando modello: {output_path}")
        
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        try:
            if format.lower() == '3mf' and PY3MF_AVAILABLE:
                # Usa py3mf per export 3MF
                mesh.export(output_path, file_type='3mf')
                self.log(f"Modello 3MF salvato: {output_path}")
            else:
                # Fallback a STL
                if format.lower() == '3mf':
                    self.log("WARNING: py3mf non disponibile, uso STL fallback")
                    output_path = output_path.replace('.3mf', '.stl')
                
                mesh.export(output_path, file_type='stl')
                self.log(f"Modello STL salvato: {output_path}")
                
        except Exception as e:
            self.log(f"Errore salvataggio {format}: {e}")
            # Fallback assoluto a STL
            fallback_path = output_path.replace('.3mf', '_fallback.stl')
            mesh.export(fallback_path)
            self.log(f"Salvato fallback: {fallback_path}")
            output_path = fallback_path
        
        return output_path
    
    def save_debug_files(self, base_mesh, qr_stamp, final_mesh, output_dir):
        """Salva file di debug per verifica"""
        debug_dir = os.path.join(output_dir, "debug")
        os.makedirs(debug_dir, exist_ok=True)
        
        # Salva QR stamp per debug
        qr_stamp.export(os.path.join(debug_dir, "qr_stamp.stl"))
        
        # Salva log
        log_path = os.path.join(debug_dir, "debug_log.txt")
        with open(log_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(self.debug_log))
        
        self.log(f"File debug salvati in: {debug_dir}")
    
    def generate(self, input_3mf, output_3mf, qr_data, qr_size_mm=22):
        """Genera il modello finale con QR inciso"""
        try:
            self.log(f"=== INIZIO GENERAZIONE ===")
            self.log(f"Input: {input_3mf}")
            self.log(f"Output: {output_3mf}")
            self.log(f"QR Data: {qr_data}")
            self.log(f"QR Size: {qr_size_mm}mm")
            
            # 1. Carica modello base
            base_mesh = self.load_base_model(input_3mf)
            
            # 2. Genera matrice QR
            qr_matrix, module_size = self.generate_qr_matrix(qr_data, qr_size_mm)
            
            # 3. Crea timbro QR 3D
            qr_stamp = self.create_qr_stamp_mesh(
                qr_matrix, module_size, 
                stamp_height=0.4,  # Altezza timbro
                z_position=-0.1    # Posizione Z (negativo = dentro la base)
            )
            
            # 4. Esegui boolean difference
            final_mesh = self.perform_boolean_difference(base_mesh, qr_stamp)
            
            # 5. Verifica risultato
            self.log(f"Final mesh: {len(final_mesh.vertices)} vertici, {len(final_mesh.faces)} faces")
            self.log(f"Final watertight: {final_mesh.is_watertight}")
            self.log(f"Final bounds: {final_mesh.bounds}")
            
            # 6. Salva modello finale
            final_path = self.save_model(final_mesh, output_3mf)
            
            # 7. Salva file debug
            output_dir = os.path.dirname(output_3mf)
            self.save_debug_files(base_mesh, qr_stamp, final_mesh, output_dir)
            
            self.log("=== GENERAZIONE COMPLETATA ===")
            return True
            
        except Exception as e:
            self.log(f"ERROR: Generazione fallita: {str(e)}")
            self.log(traceback.format_exc())
            return False

def main():
    parser = argparse.ArgumentParser(description='Generatore QR code 3D inciso')
    parser.add_argument('--input-3mf', required=True, help='Percorso modello base .3mf')
    parser.add_argument('--output-3mf', required=True, help='Percorso output .3mf')
    parser.add_argument('--qr-data', required=True, help='Dati per QR code')
    parser.add_argument('--qr-size-mm', type=float, default=22, help='Dimensione QR in mm')
    
    args = parser.parse_args()
    
    # Verifica dipendenze
    if not TRIMESH_AVAILABLE:
        print("ERROR: trimesh non disponibile")
        sys.exit(1)
    
    generator = QR3MFGenerator()
    
    success = generator.generate(
        input_3mf=args.input_3mf,
        output_3mf=args.output_3mf,
        qr_data=args.qr_data,
        qr_size_mm=args.qr_size_mm
    )
    
    if success:
        print(f"SUCCESS: Modello generato: {args.output_3mf}")
        sys.exit(0)
    else:
        print(f"FAILED: Generazione fallita - controlla debug log")
        sys.exit(1)

if __name__ == "__main__":
    main()
