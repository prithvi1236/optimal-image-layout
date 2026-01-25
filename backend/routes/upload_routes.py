"""
Upload routes for image and PDF processing
"""
import os
import uuid
from flask import Blueprint, request, jsonify
from auth import get_user_id_from_auth
from services.image_processor import ImageProcessor
from config import TEMP_UPLOAD_FOLDER

upload_bp = Blueprint('upload', __name__)
image_processor = ImageProcessor()

@upload_bp.route("/extract_img", methods=["POST"])
def extract_img():
    """Extract images from uploaded files"""
    try:
        user_id = get_user_id_from_auth()
        if not user_id: 
            return jsonify({"error": "Unauthorized"}), 401
        
        if "file" not in request.files: 
            return jsonify({"error": "No file"}), 400
        
        file = request.files["file"]
        extract_figures = request.form.get("extract_figures") == "1"
        
        # Save uploaded file temporarily
        ext = os.path.splitext(file.filename)[1].lower()
        temp_path = os.path.join(TEMP_UPLOAD_FOLDER, f"{uuid.uuid4()}{ext}")
        file.save(temp_path)

        try:
            res_images = []
            
            if ext == ".pdf":
                res_images = image_processor.process_pdf_parallel(temp_path, user_id)
            elif ext in [".png", ".jpg", ".jpeg", ".webp"]:
                if extract_figures:
                    res_images = image_processor.process_cv2_figures_parallel(temp_path, user_id)
                else:
                    res_images = image_processor.process_single_image(temp_path, user_id)
            else:
                return jsonify({"error": "Unsupported file format"}), 400

            return jsonify({"images": res_images})
            
        finally:
            # Always cleanup temp file
            image_processor.cleanup_temp_file(temp_path)

    except Exception as e:
        print(f"Upload error: {e}")
        return jsonify({"error": str(e)}), 500