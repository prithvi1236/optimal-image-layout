import os, io, uuid, traceback, json, math, time
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import fitz  # PyMuPDF
from PIL import Image
from rectpack import newPacker, PackingMode, MaxRectsBssf, SORT_DIFF, SORT_NONE
import cv2
import numpy as np
from dotenv import load_dotenv
from supabase import create_client, Client
from concurrent.futures import ThreadPoolExecutor, as_completed

load_dotenv()

# --- CONFIGURATION ---
A4_WIDTH, A4_HEIGHT = 794, 1123
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
SUPABASE_BUCKET = "assets"

# 1. FIX: Ensure temp directory exists
TEMP_UPLOAD_FOLDER = "temp_uploads"
os.makedirs(TEMP_UPLOAD_FOLDER, exist_ok=True)

# 2. FIX: Dynamic Thread Pool Sizing
# upload workers can be higher (I/O bound), CV2 workers lower (CPU bound)
CPU_COUNT = os.cpu_count() or 1
MAX_UPLOAD_WORKERS = min(16, CPU_COUNT * 4) 
MAX_CV2_WORKERS = min(8, CPU_COUNT)

# 3. FIX: Max File Size (50MB)
MAX_FILE_SIZE = 50 * 1024 * 1024 

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)

# Flask built-in protection for file size
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE 

CORS(app, resources={r"/*": {"origins": ["http://localhost:5173"]}}, 
     allow_headers=["Content-Type", "Authorization"], supports_credentials=True)

# --- AUTH HELPER ---
def get_user_id_from_auth():
    auth_header = request.headers.get("Authorization")
    if not auth_header: return None
    try:
        token = auth_header.replace("Bearer ", "")
        user = supabase.auth.get_user(token)
        return user.user.id if user and user.user else None
    except Exception:
        return None

# --- BATCH DB HELPER ---
def db_batch_insert_images(image_list):
    if not image_list: return
    try:
        supabase.table("images").insert(image_list).execute()
    except Exception as e:
        print(f"Batch Insert Error: {e}")

# --- WORKERS ---
def upload_worker(args):
    """Handles single image upload to Supabase Storage."""
    user_id, img_id, ext, data, width, height = args
    path = f"users/{user_id}/{img_id}.{ext}"
    try:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path, data, {"upsert": "true", "content-type": f"image/{ext}"}
        )
        res = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)
        public_url = res if isinstance(res, str) else res.get("publicUrl", "")
        
        return {
            "id": img_id, "user_id": user_id, "storage_path": path,
            "width": width, "height": height, "ext": ext, "url": public_url
        }
    except Exception as e:
        print(f"Upload failed: {e}")
        return None

def get_url(path):
    res = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)
    return res if isinstance(res, str) else res.get("publicUrl", "")

# --- PROCESSORS ---
def process_pdf_parallel(pdf_path, user_id):
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

    return execute_parallel_uploads(upload_tasks)

def process_cv2_figures_parallel(image_path, user_id):
    img = cv2.imread(image_path)
    if img is None: return []

    # 1. Standard Resize
    h, w = img.shape[:2]
    if w > 2500 or h > 2500:
        scale = min(2500/w, 2500/h)
        img = cv2.resize(img, None, fx=scale, fy=scale)

    # 2. Preprocessing
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Binary inverse so text/lines are white and background is black
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                   cv2.THRESH_BINARY_INV, 11, 8)

    # 3. HORIZONTAL BRIDGING (The Fix)
    # We use a very wide but short kernel to connect columns and words 
    # without merging the top diagram into the bottom text.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (100, 15)) 
    dilated = cv2.dilate(thresh, kernel, iterations=2)

    
    # 4. Find large blocks
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    upload_tasks = []
    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        
        # 5. AREA FILTERING
        # Ignore small noise (less than 5% of page width)
        if cw < (w * 0.05) or ch < (h * 0.05): 
            continue 
        
        crop = img[y:y+ch, x:x+cw]
        success, buf = cv2.imencode(".png", crop)
        if not success: continue
        
        img_id = str(uuid.uuid4())
        upload_tasks.append((user_id, img_id, "png", buf.tobytes(), cw, ch))

    return execute_parallel_uploads(upload_tasks)

def execute_parallel_uploads(tasks):
    """Shared logic to run upload threads and batch DB insert."""
    db_records = []
    frontend_response = []
    
    with ThreadPoolExecutor(max_workers=MAX_UPLOAD_WORKERS) as executor:
        future_to_task = {executor.submit(upload_worker, task): task for task in tasks}
        
        for future in as_completed(future_to_task):
            res = future.result()
            if res:
                db_records.append({
                    "id": res["id"], "user_id": res["user_id"], 
                    "storage_path": res["storage_path"], 
                    "width": res["width"], "height": res["height"], "ext": res["ext"]
                })
                frontend_response.append({
                    "id": res["id"], "url": res["url"], 
                    "width": res["width"], "height": res["height"]
                })

    if db_records:
        db_batch_insert_images(db_records)
        
    return frontend_response

# --- ROUTE: UPLOAD ---
@app.route("/extract_img", methods=["POST"])
def extract_img():
    try:
        user_id = get_user_id_from_auth()
        if not user_id: return jsonify({"error": "Unauthorized"}), 401
        
        if "file" not in request.files: return jsonify({"error": "No file"}), 400
        file = request.files["file"]
        
        # NOTE: file.read() is checked by app.config['MAX_CONTENT_LENGTH']
        # but we handle temp saving safely
        ext = os.path.splitext(file.filename)[1].lower()
        temp_path = os.path.join(TEMP_UPLOAD_FOLDER, f"{uuid.uuid4()}{ext}")
        file.save(temp_path)

        res_images = []
        if ext == ".pdf":
            res_images = process_pdf_parallel(temp_path, user_id)
        elif ext in [".png", ".jpg", ".jpeg", ".webp"]:
            if request.form.get("extract_figures") == "1":
                res_images = process_cv2_figures_parallel(temp_path, user_id)
            else:
                # Single Image
                with Image.open(temp_path) as image:
                    buf = io.BytesIO()
                    image.save(buf, format=image.format or "PNG")
                    bytes_data = buf.getvalue()
                    w, h = image.size
                
                img_id = str(uuid.uuid4())
                res = upload_worker((user_id, img_id, ext[1:], bytes_data, w, h))
                if res:
                    db_batch_insert_images([{
                        "id": res["id"], "user_id": res["user_id"], 
                        "storage_path": res["storage_path"], 
                        "width": res["width"], "height": res["height"], "ext": res["ext"]
                    }])
                    res_images.append({"id": res["id"], "url": res["url"], "width": w, "height": h})

        if os.path.exists(temp_path): os.remove(temp_path)
        return jsonify({"images": res_images})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# --- ROUTE: ONE-SHOT LAYOUT (FAST) ---
@app.route("/layout", methods=["POST"])
def create_layout_fast():
    user_id = get_user_id_from_auth()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    items = data.get("items", [])
    if not items: return jsonify({"layout": {}, "page_count": 0})
    
    margin, gap = data.get("margin", 40), data.get("gap", 20)
    
    # 1. Fetch metadata
    item_ids = [it["id"] for it in items]
    db_imgs = supabase.table("images").select("*").in_("id", item_ids).execute()
    img_map = {img["id"]: img for img in db_imgs.data}

    # 2. Prep Rectangles
    # FIX: Subtract margins from the bin size so images stay inside the visible page
    max_w, max_h = A4_WIDTH - (2 * margin), A4_HEIGHT - (2 * margin)
    rects_to_pack = []
    total_area = 0

    for it in items:
        img = img_map.get(it["id"])
        if not img: continue
        
        scale = it.get("scale", 1)
        w, h = int(img["width"] * scale), int(img["height"] * scale)
        
        # FIX: Ensure image + gap doesn't exceed the USABLE area
        limit_w, limit_h = max_w - gap, max_h - gap
        if w > limit_w or h > limit_h:
            ratio = min(limit_w / w, limit_h / h)
            w, h = int(w * ratio), int(h * ratio)
            
        rects_to_pack.append((w + gap, h + gap, it["id"]))
        total_area += (w + gap) * (h + gap)

    # 3. One-Shot Packing
    estimated_pages = math.ceil(total_area / (max_w * max_h)) + 5
    packer = newPacker(mode=PackingMode.Offline, pack_algo=MaxRectsBssf, sort_algo=SORT_DIFF)
    
    # FIX: Use the calculated usable area as the bin size
    for _ in range(estimated_pages): packer.add_bin(max_w, max_h)
    for r in rects_to_pack: packer.add_rect(*r)
    
    packer.pack()
    
    # 4. Format
    res_layout = {}
    for b, x, y, w, h, rid in packer.rect_list():
        # Final safety: If rectpack returned a coordinate that pushes the width out
        # (Though with the fix above, rid will be within 0 -> max_w)
        url = get_url(img_map[rid]["storage_path"])
        res_layout.setdefault(b + 1, []).append({
            "image_id": rid, 
            "x": x + margin, # Apply the offset after packing
            "y": y + margin,
            "width": w - gap, 
            "height": h - gap, 
            "url": url
        })

    return jsonify({"layout": res_layout, "page_count": len(res_layout)})

# --- ROUTE: STREAMING LAYOUT (UX) ---
@app.route("/layout_stream", methods=["POST"])
def create_layout_stream():
    user_id = get_user_id_from_auth()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    items = data.get("items", [])
    margin, gap = data.get("margin", 40), data.get("gap", 20)
    
    item_ids = [it["id"] for it in items]
    db_imgs = supabase.table("images").select("*").in_("id", item_ids).execute()
    img_map = {img["id"]: img for img in db_imgs.data}

    def generate():
        # FIX: Calculate internal usable area
        max_w, max_h = A4_WIDTH - (2 * margin), A4_HEIGHT - (2 * margin)
        
        rects = []
        for it in items:
            img = img_map.get(it["id"])
            if not img: continue
            scale = it.get("scale", 1)
            w, h = int(img["width"] * scale), int(img["height"] * scale)
            
            # FIX: Check against usable area minus gap
            limit_w, limit_h = max_w - gap, max_h - gap
            if w > limit_w or h > limit_h:
                ratio = min(limit_w / w, limit_h / h)
                w, h = int(w * ratio), int(h * ratio)
            
            rects.append({
                "w": w + gap, "h": h + gap, "id": it["id"], 
                "final_w": w, "final_h": h, "path": img["storage_path"]
            })

        rects.sort(key=lambda x: x["h"], reverse=True)
        remaining = rects[:]
        page_num = 1
        
        while remaining:
            # FIX: Pack inside usable area bin
            packer = newPacker(mode=PackingMode.Offline, pack_algo=MaxRectsBssf, sort_algo=SORT_NONE)
            packer.add_bin(max_w, max_h)
            
            for r in remaining:
                packer.add_rect(r["w"], r["h"], r["id"])
            
            packer.pack()
            
            packed_on_page = []
            placed_ids = set()
            
            for b, x, y, w, h, rid in packer.rect_list():
                if b == 0:
                    r_data = next(r for r in remaining if r["id"] == rid)
                    packed_on_page.append({
                        "image_id": rid,
                        "x": x + margin, # Offset by margin
                        "y": y + margin,
                        "width": r_data["final_w"],
                        "height": r_data["final_h"],
                        "url": get_url(r_data["path"])
                    })
                    placed_ids.add(rid)
            
            if packed_on_page:
                yield f"data: {json.dumps({'type': 'page', 'page': page_num, 'items': packed_on_page})}\n\n"
                page_num += 1
                remaining = [r for r in remaining if r["id"] not in placed_ids]
            else:
                break 

        yield f"data: {json.dumps({'type': 'complete', 'total_pages': page_num - 1})}\n\n"

    return Response(generate(), mimetype='text/event-stream')

# --- USER DATA & CLEANUP ---
@app.route("/user_images", methods=["GET"])
def get_user_images():
    user_id = get_user_id_from_auth()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    
    res = supabase.table("images").select("*").eq("user_id", user_id).execute()
    data = []
    for img in res.data:
        orig_w, orig_h = img["width"], img["height"]
        safe_w, safe_h = A4_WIDTH - 80, A4_HEIGHT - 80
        scale = min(1.0, safe_w/orig_w, safe_h/orig_h)
        data.append({
            "id": img["id"], "url": get_url(img["storage_path"]),
            "scale": scale, "origW": orig_w, "origH": orig_h
        })
    return jsonify({"images": data})

@app.route("/delete_image", methods=["POST"])
def delete_image():
    user_id = get_user_id_from_auth()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    
    img_id = request.json.get("image_id")
    img = supabase.table("images").select("storage_path").eq("id", img_id).eq("user_id", user_id).single().execute()
    
    if img.data:
        supabase.storage.from_(SUPABASE_BUCKET).remove([img.data["storage_path"]])
        supabase.table("images").delete().eq("id", img_id).execute()
        
    return jsonify({"success": True})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True, threaded=True)