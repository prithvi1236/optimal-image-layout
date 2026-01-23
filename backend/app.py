import os, io, uuid, traceback, time, re, json
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import fitz  # PyMuPDF
from PIL import Image
from rectpack import newPacker, PackingMode, MaxRectsBssf, SORT_NONE
import cv2
import numpy as np
from dotenv import load_dotenv
from supabase import create_client, Client
from concurrent.futures import ThreadPoolExecutor
import threading 

load_dotenv() 

# Config
A4_WIDTH, A4_HEIGHT = 794, 1123
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
SUPABASE_BUCKET = "assets"
TEMP_UPLOAD_FOLDER = "temp_uploads"
os.makedirs(TEMP_UPLOAD_FOLDER, exist_ok=True)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173"]}}, 
     allow_headers=["Content-Type", "Authorization"], supports_credentials=True)

# --- AUTH HELPER ---
def get_user_id_from_auth():
    auth_header = request.headers.get("Authorization")
    if not auth_header: 
        return None
    try:
        token = auth_header.replace("Bearer ", "")
        user = supabase.auth.get_user(token)
        return user.user.id if user and user.user else None
    except Exception as e:
        print(f"Auth error: {e}")
        return None

# --- STORAGE HELPERS ---
def upload_to_supabase(user_id, img_id, ext, data):
    path = f"users/{user_id}/{img_id}.{ext}"
    file_options = {"upsert": "true", "content-type": f"image/{ext}"}
    supabase.storage.from_(SUPABASE_BUCKET).upload(path, data, file_options)
    return path

def get_url(path):
    # Get the response from Supabase
    res = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)
    
    # If it's already a string (newer versions), return it
    if isinstance(res, str):
        return res
    
    # If it's an object (older versions), extract the publicUrl
    return res.get("publicUrl", "")

# --- DB HELPERS ---
def db_insert_image(img_id, user_id, storage_path, w, h, ext):
    data = {"id": img_id, "user_id": user_id, "storage_path": storage_path, "width": w, "height": h, "ext": ext}
    supabase.table("images").insert(data).execute()

def db_get_image(img_id, user_id):
    res = supabase.table("images").select("*").eq("id", img_id).eq("user_id", user_id).single().execute()
    return res.data

def db_delete_image(img_id, user_id):
    img = db_get_image(img_id, user_id)
    if not img: return None
    supabase.table("images").delete().eq("id", img_id).eq("user_id", user_id).execute()
    return img["storage_path"]

def extract_images_from_pdf(pdf_path, user_id):
    """Extracts all images and ensures they are indexed in Supabase."""
    doc = fitz.open(pdf_path)
    extracted_images = []
    
    for page in doc:
        for img_info in page.get_images(full=True):
            xref = img_info[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            ext = base_image["ext"]
            
            img_id = str(uuid.uuid4())
            # Use PIL to get dimensions safely
            with Image.open(io.BytesIO(image_bytes)) as img_obj:
                w, h = img_obj.size
            
            # Upload to Supabase Storage
            path = upload_to_supabase(user_id, img_id, ext, image_bytes)
            # Insert to Supabase DB
            db_insert_image(img_id, user_id, path, w, h, ext)
            
            extracted_images.append({
                "id": img_id,
                "url": get_url(path),
                "width": w,
                "height": h
            })
    doc.close()
    return extracted_images

# --- ROUTES ---
@app.route("/extract_img", methods=["POST"])
def extract_img():
    try:
        user_id = get_user_id_from_auth()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        ext = os.path.splitext(file.filename)[1].lower()
        temp_path = os.path.join(TEMP_UPLOAD_FOLDER, f"{uuid.uuid4()}{ext}")
        file.save(temp_path)

        res_images = []

        # 1. Handle PDF
        if ext == ".pdf":
            # (Assuming you want to keep the PDF logic we discussed earlier)
            res_images = extract_images_from_pdf(temp_path, user_id)

        # 2. Handle Images
        elif ext in [".png", ".jpg", ".jpeg", ".webp"]:
            # CHECK: Did the user ask to extract figures?
            if request.form.get("extract_figures") == "1":
                # CALL YOUR RESTORED OPENCV LOGIC
                res_images = extract_figures_from_image(temp_path, user_id)
            else:
                # Standard single image upload
                image = Image.open(temp_path)
                img_id = str(uuid.uuid4())
                buf = io.BytesIO()
                image.save(buf, format=image.format or "PNG")
                bytes_data = buf.getvalue()
                
                path = upload_to_supabase(user_id, img_id, ext[1:], bytes_data)
                db_insert_image(img_id, user_id, path, image.width, image.height, ext[1:])
                res_images.append({
                    "id": img_id, 
                    "url": get_url(path), 
                    "width": image.width, 
                    "height": image.height
                })

        if os.path.exists(temp_path):
            os.remove(temp_path)

        return jsonify({"images": res_images})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

def extract_figures_from_image(image_path, user_id):
    """
    OPTIMIZED: Parallel figure extraction with faster OpenCV parameters
    """
    img = cv2.imread(image_path)
    if img is None:
        return []

    # Resize large images for faster processing
    height, width = img.shape[:2]
    if width > 2000 or height > 2000:
        scale = min(2000/width, 2000/height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        img = cv2.resize(img, (new_width, new_height))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # OPTIMIZED: Faster adaptive threshold parameters
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11, 8  # Reduced from 15, 10 for speed
    )

    # OPTIMIZED: Smaller kernel for faster morphology
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))  # Reduced from 25x25
    clean = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(
        clean,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    # PARALLEL PROCESSING: Process multiple crops simultaneously
    def process_contour(cnt):
        x, y, w, h = cv2.boundingRect(cnt)
        
        # Early filtering - skip small regions
        if w < 100 or h < 100:  # Reduced threshold for speed
            return None
            
        crop = img[y:y+h, x:x+w]
        img_id = str(uuid.uuid4())
        ext = "png"

        success, buf = cv2.imencode(".png", crop)
        if not success:
            return None
            
        bytes_data = buf.tobytes()
        path = upload_to_supabase(user_id, img_id, ext, bytes_data)
        db_insert_image(img_id, user_id, path, w, h, ext)

        return {
            "id": img_id,
            "width": w,
            "height": h,
            "ext": ext,
            "url": get_url(path)
        }

    # Process contours in parallel
    extracted_list = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = executor.map(process_contour, contours)
        extracted_list = [r for r in results if r is not None]

    return extracted_list

# --- STREAMING LAYOUT ENGINE ---
@app.route("/layout_stream", methods=["POST"])
def create_layout_stream():
    """
    STREAMING: Generate layout page-by-page and stream results
    """
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    items, margin, gap = data.get("items", []), data.get("margin", 40), data.get("gap", 20)
    
    def generate_streaming_layout():
        max_w, max_h = A4_WIDTH - 2*margin, A4_HEIGHT - 2*margin
        rects = []

        # Prepare rectangles with image data
        for it in items:
            img = db_get_image(it["id"], user_id)
            if img:
                orig_w, orig_h = img["width"], img["height"]
                scale = it.get("scale", 1)
                w, h = int(orig_w * scale), int(orig_h * scale)

                # Scale down if needed
                max_allowed_w, max_allowed_h = max_w - gap, max_h - gap
                if w > max_allowed_w or h > max_allowed_h:
                    ratio = min(max_allowed_w / w, max_allowed_h / h)
                    w, h = int(w * ratio), int(h * ratio)

                rects.append({
                    "w": w + gap, "h": h + gap, "id": it["id"], 
                    "img": img, "final_w": w, "final_h": h
                })

        # Sort by height for better packing
        rects.sort(key=lambda x: x["h"], reverse=True)
        
        page_num = 1
        remaining_rects = rects[:]
        
        while remaining_rects:
            # Create packer for current page
            packer = newPacker(mode=PackingMode.Offline, pack_algo=MaxRectsBssf, sort_algo=SORT_NONE)
            packer.add_bin(max_w, max_h)
            
            # Add all remaining rectangles
            for r in remaining_rects:
                packer.add_rect(r["w"], r["h"], r["id"])
            
            packer.pack()
            
            # Extract items that fit on this page
            page_items = []
            placed_ids = set()
            
            for b, x, y, w, h, rid in packer.rect_list():
                if b == 0:  # Only first bin (current page)
                    rect_data = next(r for r in remaining_rects if r["id"] == rid)
                    page_items.append({
                        "image_id": rid,
                        "x": x + margin,
                        "y": y + margin,
                        "width": rect_data["final_w"],
                        "height": rect_data["final_h"],
                        "url": get_url(rect_data["img"]["storage_path"])
                    })
                    placed_ids.add(rid)
            
            # Stream this page immediately
            if page_items:
                page_data = {
                    "type": "page",
                    "page": page_num,
                    "items": page_items,
                    "completed": False
                }
                yield f"data: {json.dumps(page_data)}\n\n"
                page_num += 1
            
            # Remove placed items from remaining
            remaining_rects = [r for r in remaining_rects if r["id"] not in placed_ids]
            
            # Safety break if no progress
            if not placed_ids:
                break
        
        # Send completion signal
        completion_data = {
            "type": "complete",
            "total_pages": page_num - 1,
            "completed": True
        }
        yield f"data: {json.dumps(completion_data)}\n\n"

    return Response(
        generate_streaming_layout(),
        mimetype='text/plain',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': 'http://localhost:5173',
            'Access-Control-Allow-Credentials': 'true'
        }
    )

# --- OPTIMIZED LAYOUT ENGINE ---
@app.route("/layout", methods=["POST"])
def create_layout():
    user_id = get_user_id_from_auth()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    items, margin, gap = data.get("items", []), data.get("margin", 40), data.get("gap", 20)
    
    # Calculate printable area
    max_w, max_h = A4_WIDTH - 2*margin, A4_HEIGHT - 2*margin
    rects = []

    for it in items:
        img = db_get_image(it["id"], user_id)
        if img:
            orig_w = img["width"]
            orig_h = img["height"]

            # 1. Apply user scale (default scale = 1)
            scale = it.get("scale", 1)
            w = int(orig_w * scale)
            h = int(orig_h * scale)

            # 2. Only scale DOWN if image exceeds printable area
            max_allowed_w = max_w - gap
            max_allowed_h = max_h - gap

            if w > max_allowed_w or h > max_allowed_h:
                ratio_w = max_allowed_w / w
                ratio_h = max_allowed_h / h
                ratio = min(ratio_w, ratio_h)  # preserve aspect ratio

                w = int(w * ratio)
                h = int(h * ratio)

            # 3. Add to packer
            rects.append((w + gap, h + gap, it["id"]))


    # STABILITY FIX: Sorting by height descending makes packing much tighter
    rects.sort(key=lambda x: x[1], reverse=True)

    packer = newPacker(mode=PackingMode.Offline, pack_algo=MaxRectsBssf, sort_algo=SORT_NONE)
    packer.add_bin(max_w, max_h)
    for r in rects: packer.add_rect(*r)
    packer.pack()

    # Fallback: If some didn't fit, add more bins
    if len(packer.rect_list()) < len(rects):
        for _ in range(len(rects)): packer.add_bin(max_w, max_h)
        packer.pack()

    res_layout = {}
    for b, x, y, w, h, rid in packer.rect_list():
        img = db_get_image(rid, user_id)
        res_layout.setdefault(b + 1, []).append({
            "image_id": rid, "x": x + margin, "y": y + margin, 
            "width": w - gap, "height": h - gap, "url": get_url(img["storage_path"])
        })
    return jsonify({"layout": res_layout, "page_count": len(res_layout) or 1})

@app.route("/user_images", methods=["GET"])
def get_user_images():
    """
    Get all images for the current user to restore session
    """
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        # Get all images for this user
        result = supabase.table("images").select("*").eq("user_id", user_id).execute()
        
        images = []
        for img in result.data:
            # Calculate default scale based on image size
            orig_w, orig_h = img["width"], img["height"]
            max_w, max_h = A4_WIDTH - 80, A4_HEIGHT - 80  # Account for margins
            scale = min(1.0, max_w / orig_w, max_h / orig_h)
            
            images.append({
                "id": img["id"],
                "url": get_url(img["storage_path"]),
                "scale": scale,
                "origW": orig_w,
                "origH": orig_h
            })
        
        return jsonify({"images": images})
        
    except Exception as e:
        print(f"Error fetching user images: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/delete_image", methods=["POST"])
def delete_image():
    user_id = get_user_id_from_auth()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    img_id = request.json.get("image_id")
    path = db_delete_image(img_id, user_id)
    if path: supabase.storage.from_(SUPABASE_BUCKET).remove([path])
    return jsonify({"success": True})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)