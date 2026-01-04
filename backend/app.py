import os
import io
import uuid
import time
import shutil
import threading
import fitz  # PyMuPDF
import traceback
from PIL import Image
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from rectpack import newPacker, PackingMode, MaxRectsBssf, SORT_NONE

# =========================
# CONFIGURATION
# =========================
A4_WIDTH = 794
A4_HEIGHT = 1123
UPLOAD_BASE = "uploads"
OUTPUT_BASE = "output"

# Environment-based configuration
PORT = int(os.environ.get("PORT", 5001))
IS_PRODUCTION = os.environ.get("FLASK_ENV") == "production"
SERVER_URL = os.environ.get("SERVER_URL", f"http://localhost:{PORT}")

# Ensure directories exist
os.makedirs(UPLOAD_BASE, exist_ok=True)
os.makedirs(OUTPUT_BASE, exist_ok=True)

app = Flask(__name__)

# CORS configuration for production
if IS_PRODUCTION:
    # In production, allow specific origins
    CORS(app, resources={
        r"/*": {
            "origins": [
                "https://smart-layout-frontend.onrender.com",
                "https://*.onrender.com"
            ]
        }
    })
else:
    # In development, allow all origins
    CORS(app, resources={r"/*": {"origins": "*"}})

# =========================
# IN-MEMORY DATABASE (Session Aware)
# Structure: { session_id: { image_id: { path, width, height, ext } } }
# =========================
images_db = {}

# =========================
# HELPER: SESSION MANAGEMENT
# =========================
def get_session_id():
    """Retrieves the unique session ID from headers to isolate user data."""
    sid = request.headers.get('x-session-id')
    if not sid:
        return "default_guest"
    return sid

def get_user_folders(session_id):
    """Creates/Retrieves session-specific folders for isolation."""
    u_upload = os.path.join(UPLOAD_BASE, session_id)
    u_output = os.path.join(OUTPUT_BASE, session_id)
    os.makedirs(u_upload, exist_ok=True)
    os.makedirs(u_output, exist_ok=True)
    return u_upload, u_output

# =========================
# BACKGROUND CLEANUP THREAD
# =========================
def cleanup_old_sessions():
    """Deletes session folders older than 3 minutes to free up space."""
    MAX_AGE = 600  # 10 min in seconds
    while True:
        try:
            now = time.time()
            cleaned_count = 0
            
            for root in [UPLOAD_BASE, OUTPUT_BASE]:
                if not os.path.exists(root): 
                    continue
                
                # List all items in the directory
                items = os.listdir(root)
                print(f"🔍 Checking {root}: found {len(items)} items")
                
                for sid in items:
                    session_path = os.path.join(root, sid)
                    
                    # Only process directories (skip files like .DS_Store)
                    if not os.path.isdir(session_path):
                        continue
                        
                    # Check modification time
                    mtime = os.stat(session_path).st_mtime
                    age = now - mtime
                    
                    print(f"📁 Session {sid}: age = {age:.1f}s (max: {MAX_AGE}s)")
                    
                    if age > MAX_AGE:
                        shutil.rmtree(session_path)
                        print(f"🧹 Cleaned up expired session: {sid} (age: {age:.1f}s)")
                        cleaned_count += 1
                        
                        # Remove from RAM database
                        if sid in images_db:
                            del images_db[sid]
                            print(f"🗑️  Removed {sid} from memory database")
            
            if cleaned_count == 0:
                print(f"✅ No cleanup needed - all sessions are recent")
                        
        except Exception as e:
            print(f"❌ Cleanup Error: {e}")
            traceback.print_exc()
            
        time.sleep(120)  # Run check every 2 min

# Start the cleanup thread automatically
threading.Thread(target=cleanup_old_sessions, daemon=True).start()

# =========================
# ROUTES
# =========================

@app.route("/")
def home():
    return jsonify({
        "status": "running",
        "service": "Smart Layout Backend",
        "version": "2.0",
        "environment": "production" if IS_PRODUCTION else "development"
    })

@app.route("/health")
def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": time.time(),
        "sessions": len(images_db),
        "uptime": "running"
    })

@app.route("/output/<session_id>/<filename>")
def get_image(session_id, filename):
    """Serves images from the user's specific session folder."""
    user_out_path = os.path.join(OUTPUT_BASE, session_id)
    return send_from_directory(user_out_path, filename)

@app.route("/extract_img", methods=["POST"])
def extract_img():
    """
    Handles both PDF extraction and direct Image uploads.
    Supports: .pdf, .png, .jpg, .jpeg, .webp, .bmp
    """
    try:
        sid = get_session_id()
        user_upload_dir, user_output_dir = get_user_folders(sid)

        # Initialize session in DB if not present
        if sid not in images_db:
            images_db[sid] = {}

        if "files" not in request.files:
            return jsonify({"error": "No files uploaded"}), 400

        files = request.files.getlist("files")
        response_data = []

        for file in files:
            filename = file.filename
            ext = os.path.splitext(filename)[1].lower()
            temp_path = os.path.join(user_upload_dir, filename)
            file.save(temp_path)

            processed_images = []

            # -----------------------------------------
            # CASE 1: PDF EXTRACTION
            # -----------------------------------------
            if ext == ".pdf":
                doc = fitz.open(temp_path)
                for page in doc:
                    for img in page.get_images(full=True):
                        xref = img[0]
                        base = doc.extract_image(xref)
                        processed_images.append({
                            "bytes": base["image"],
                            "ext": base["ext"]
                        })
                doc.close()

            # -----------------------------------------
            # CASE 2: DIRECT IMAGE UPLOAD (Extract Figures)
            # -----------------------------------------
            elif ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"]:
                with open(temp_path, "rb") as f:
                    processed_images.append({
                        "bytes": f.read(),
                        "ext": ext[1:] if ext != ".jpeg" else "jpg"
                    })

            # -----------------------------------------
            # SAVE PROCESSED ASSETS
            # -----------------------------------------
            for item in processed_images:
                img_id = str(uuid.uuid4())
                save_ext = item["ext"]
                
                # Load PIL to get dimensions (Critical for layout engine)
                try:
                    pil_img = Image.open(io.BytesIO(item["bytes"]))
                    
                    # Convert specific modes like RGBA to RGB if saving as JPEG
                    if save_ext.lower() in ['jpg', 'jpeg'] and pil_img.mode == 'RGBA':
                        pil_img = pil_img.convert('RGB')
                        
                    out_path = os.path.join(user_output_dir, f"{img_id}.{save_ext}")
                    pil_img.save(out_path)

                    # Save metadata to DB
                    images_db[sid][img_id] = {
                        "width": pil_img.width,
                        "height": pil_img.height,
                        "ext": save_ext
                    }

                    # Construct Response for Frontend
                    full_url = f"{SERVER_URL}/output/{sid}/{img_id}.{save_ext}"
                    response_data.append({
                        "id": img_id,
                        "width": pil_img.width,
                        "height": pil_img.height,
                        "url": full_url
                    })
                except Exception as img_err:
                    print(f"Error processing image {img_id}: {img_err}")
                    continue

        return jsonify({"images": response_data})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/delete_image", methods=["POST"])
def delete_image():
    """Deletes an image from the user's session folder and DB."""
    try:
        sid = get_session_id()
        data = request.get_json()
        img_id = data.get("image_id")

        if sid in images_db and img_id in images_db[sid]:
            img_info = images_db[sid][img_id]
            file_path = os.path.join(OUTPUT_BASE, sid, f"{img_id}.{img_info['ext']}")
            
            if os.path.exists(file_path):
                os.remove(file_path)
            
            del images_db[sid][img_id]

        return jsonify({"status": "deleted"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/layout", methods=["POST"])
def create_layout():
    """Generates the A4 layout based on frontend input order and scale."""
    try:
        sid = get_session_id()
        
        if sid not in images_db:
            return jsonify({"page_count": 1, "layout": {}})

        data = request.get_json()
        items = data.get("items", []) # This list preserves the user's drag order
        margin = data.get("margin", 40)
        gap = data.get("gap", 20)

        rectangles = []
        user_imgs = images_db[sid]

        # Prepare list for packer
        for item in items:
            img_id = item.get("id")
            scale = item.get("scale", 1.0)
            
            if img_id not in user_imgs:
                continue

            entry = user_imgs[img_id]
            w = int(entry["width"] * scale) + gap
            h = int(entry["height"] * scale) + gap
            
            rectangles.append((w, h, img_id))

        # Pack
        packer = newPacker(
            mode=PackingMode.Offline, 
            pack_algo=MaxRectsBssf, 
            rotation=False, 
            sort_algo=SORT_NONE # Respect user order
        )
        packer.add_bin(A4_WIDTH - 2*margin, A4_HEIGHT - 2*margin)
        
        for w, h, rid in rectangles:
            packer.add_rect(w, h, rid)
        
        packer.pack()

        # Retry if needed (add pages)
        if len(packer.rect_list()) < len(rectangles):
            packer = newPacker(
                mode=PackingMode.Offline, 
                pack_algo=MaxRectsBssf, 
                rotation=False, 
                sort_algo=SORT_NONE
            )
            for _ in range(len(rectangles)): 
                packer.add_bin(A4_WIDTH - 2*margin, A4_HEIGHT - 2*margin)
            for w, h, rid in rectangles: 
                packer.add_rect(w, h, rid)
            packer.pack()

        # Build Response
        layout = {}
        for bin_id, x, y, w, h, img_id in packer.rect_list():
            if img_id in user_imgs:
                ext = user_imgs[img_id]["ext"]
                url = f"{SERVER_URL}/output/{sid}/{img_id}.{ext}"
                
                layout.setdefault(bin_id + 1, []).append({
                    "image_id": img_id,
                    "url": url,
                    "x": x + margin,
                    "y": y + margin,
                    "width": w - gap,
                    "height": h - gap
                })

        return jsonify({"page_count": len(layout), "layout": layout})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=not IS_PRODUCTION)