"""
Image processing services for PDF extraction and figure detection
"""
import os
import io
import uuid
import fitz  # PyMuPDF
from PIL import Image
import cv2
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Tuple, Dict, Any

from config import MAX_UPLOAD_WORKERS, TEMP_UPLOAD_FOLDER
from database import get_supabase_client
from services.storage_service import upload_image_to_storage

class ImageProcessor:
    def __init__(self):
        self.supabase = get_supabase_client()

    def process_pdf_parallel(self, pdf_path: str, user_id: str) -> List[Dict[str, Any]]:
        """Extract images from PDF in parallel"""
        doc = fitz.open(pdf_path)
        upload_tasks = []

        for page in doc:
            for img_info in page.get_images(full=True):
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                ext = base_image["ext"]
                
                # Fast dimension check
                try:
                    with Image.open(io.BytesIO(image_bytes)) as img_obj:
                        w, h = img_obj.size
                except:
                    continue

                img_id = str(uuid.uuid4())
                upload_tasks.append((user_id, img_id, ext, image_bytes, w, h))
        
        doc.close()
        return self._execute_parallel_uploads(upload_tasks)

    def process_cv2_figures_parallel(self, image_path: str, user_id: str) -> List[Dict[str, Any]]:
        """Extract figures from image using CV2 in parallel"""
        img = cv2.imread(image_path)
        if img is None: 
            return []

        # Standard Resize
        h, w = img.shape[:2]
        if w > 2500 or h > 2500:
            scale = min(2500/w, 2500/h)
            img = cv2.resize(img, None, fx=scale, fy=scale)

        # Preprocessing
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Binary inverse so text/lines are white and background is black
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                       cv2.THRESH_BINARY_INV, 11, 8)

        # Horizontal bridging - connect columns and words without merging diagrams
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (100, 15)) 
        dilated = cv2.dilate(thresh, kernel, iterations=2)
        
        # Find large blocks
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        upload_tasks = []
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            
            # Area filtering - ignore small noise (less than 5% of page width)
            if cw < (w * 0.05) or ch < (h * 0.05): 
                continue 
            
            crop = img[y:y+ch, x:x+cw]
            success, buf = cv2.imencode(".png", crop)
            if not success: 
                continue
            
            img_id = str(uuid.uuid4())
            upload_tasks.append((user_id, img_id, "png", buf.tobytes(), cw, ch))

        return self._execute_parallel_uploads(upload_tasks)

    def process_single_image(self, image_path: str, user_id: str) -> List[Dict[str, Any]]:
        """Process a single image upload"""
        try:
            with Image.open(image_path) as image:
                buf = io.BytesIO()
                image.save(buf, format=image.format or "PNG")
                bytes_data = buf.getvalue()
                w, h = image.size
                ext = image.format.lower() if image.format else "png"
            
            img_id = str(uuid.uuid4())
            result = upload_image_to_storage(user_id, img_id, ext, bytes_data, w, h)
            
            if result:
                self._batch_insert_images([{
                    "id": result["id"], 
                    "user_id": result["user_id"], 
                    "storage_path": result["storage_path"], 
                    "width": result["width"], 
                    "height": result["height"], 
                    "ext": result["ext"]
                }])
                return [{
                    "id": result["id"], 
                    "url": result["url"], 
                    "origW": w, 
                    "origH": h,
                    "scale": 1.0
                }]
            return []
        except Exception as e:
            print(f"Error processing single image: {e}")
            return []

    def _execute_parallel_uploads(self, tasks: List[Tuple]) -> List[Dict[str, Any]]:
        """Execute parallel uploads and batch insert to database"""
        db_records = []
        frontend_response = []
        
        with ThreadPoolExecutor(max_workers=MAX_UPLOAD_WORKERS) as executor:
            future_to_task = {executor.submit(upload_image_to_storage, *task): task for task in tasks}
            
            for future in as_completed(future_to_task):
                result = future.result()
                if result:
                    db_records.append({
                        "id": result["id"], 
                        "user_id": result["user_id"], 
                        "storage_path": result["storage_path"], 
                        "width": result["width"], 
                        "height": result["height"], 
                        "ext": result["ext"]
                    })
                    frontend_response.append({
                        "id": result["id"], 
                        "url": result["url"], 
                        "origW": result["width"], 
                        "origH": result["height"],
                        "scale": 1.0
                    })

        if db_records:
            self._batch_insert_images(db_records)
            
        return frontend_response

    def _batch_insert_images(self, image_list: List[Dict[str, Any]]) -> None:
        """Batch insert images to database"""
        if not image_list: 
            return
        try:
            self.supabase.table("images").insert(image_list).execute()
        except Exception as e:
            print(f"Batch Insert Error: {e}")

    def cleanup_temp_file(self, file_path: str) -> None:
        """Clean up temporary file"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Error cleaning up temp file {file_path}: {e}")