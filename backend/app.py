import os
import io
import uuid
import fitz  # PyMuPDF
import traceback
from PIL import Image
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from rectpack import newPacker, PackingMode, MaxRectsBssf

# =========================
# CONFIG
# =========================
A4_WIDTH = 794     # px @ 96 DPI
A4_HEIGHT = 1123

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "output"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# =========================
# APP SETUP
# =========================
app = Flask(__name__)

# ✅ CORRECT CORS (ONLY THIS)
CORS(
    app,
    resources={r"/*": {"origins": [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]}},
    supports_credentials=False
)

# =========================
# IN-MEMORY IMAGE DB
# =========================
images_db = {}  # image_id -> {path, width, height, ext}

# =========================
# HELPERS
# =========================
def extract_images_from_pdf(pdf_path):
    saved_ids = []
    doc = fitz.open(pdf_path)

    for page in doc:
        for img in page.get_images(full=True):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            ext = base_image["ext"]

            image = Image.open(io.BytesIO(image_bytes))
            img_id = str(uuid.uuid4())
            img_name = f"{img_id}.{ext}"
            img_path = os.path.join(OUTPUT_FOLDER, img_name)

            image.save(img_path)

            images_db[img_id] = {
                "path": img_path,
                "width": image.width,
                "height": image.height,
                "ext": ext
            }

            saved_ids.append(img_id)

    doc.close()
    return saved_ids

# =========================
# ROUTES
# =========================
@app.route("/")
def home():
    return "Image Layout Backend (MaxRects)"

@app.route("/output/<filename>")
def get_image(filename):
    return send_from_directory(OUTPUT_FOLDER, filename)

@app.route("/extract_img", methods=["POST"])
def extract_img():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "Empty filename"}), 400

        filename = file.filename
        ext = os.path.splitext(filename)[1].lower()
        temp_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(temp_path)

        image_ids = []

        if ext == ".pdf":
            image_ids = extract_images_from_pdf(temp_path)
            # You might need to adjust extract_images_from_pdf to return dicts with w/h too
            # For simplicity, let's assume we fetch them from DB below

        # ... existing logic ...

        # 👇 UPDATED RESPONSE CONSTRUCTION
        response_data = []
        for i_id in image_ids:
             # Retrieve details we just saved
             img_data = images_db[i_id] 
             response_data.append({
                 "id": i_id,
                 "width": img_data["width"],
                 "height": img_data["height"]
             })

        return jsonify({"images": response_data})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ... (Imports and Config remain the same) ...

# =========================
# LAYOUT API (UPDATED)
# =========================
@app.route("/layout", methods=["POST"])
def create_layout():
    try:
        data = request.get_json()

        # EXPECTED INPUT:
        # {
        #   "items": [
        #      {"id": "uuid-1", "scale": 1.0}, 
        #      {"id": "uuid-2", "scale": 0.8}
        #   ],
        #   "margin": 40,
        #   "gap": 20
        # }
        
        items = data.get("items", []) # Ordered list from frontend
        margin = data.get("margin", 40)
        gap = data.get("gap", 20)

        if not image_ids:
            return jsonify({"error": "No images provided"}), 400

        rectangles = []

        # Process items in the order received (Priority Order)
        for item in items:
            img_id = item.get("id")
            scale = item.get("scale", 1.0) # Default to 1.0 if not sent
            
            img = images_db.get(img_id)
            if not img:
                continue

            # Calculate scaled dimensions + gap
            w = int(img["width"] * scale) + gap
            h = int(img["height"] * scale) + gap
            
            # Store tuple: (width, height, image_id)
            # We put img_id last because rectpack expects (w, h, rid)
            rectangles.append((w, h, img_id))

        layout = pack_rectangles(
            rectangles,
            A4_WIDTH - 2 * margin,
            A4_HEIGHT - 2 * margin,
            gap
        )

        return jsonify({
            "page_count": len(layout),
            "layout": layout
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# =========================
# MAXRECTS PACKING (UPDATED)
# =========================
def pack_rectangles(rectangles, bin_w, bin_h, margin, gap):
    # ❌ REMOVED SORTING: rectangles.sort(key=lambda r: r[1] * r[2], reverse=True)
    # We now trust the order sent by the Frontend for priority.

    # Initialize Packer
    packer = newPacker(
        mode=PackingMode.Offline, # Offline tries to pack tighter
        pack_algo=MaxRectsBssf,
        rotation=False
    )

    # --- STRATEGY: Dynamic Bin Allocation ---
    
    # 1. Add the first bin (Page 1)
    packer.add_bin(bin_w, bin_h)

    # 2. Add rectangles in user-defined order
    for w, h, img_id in rectangles:
        packer.add_rect(w, h, img_id)

    # 3. Pack
    packer.pack()

    # 4. Check if items didn't fit (unpacked list)
    # If items are missing, add more bins (pages) and retry ONLY the missing ones?
    # Actually, rectpack is simpler: Add enough bins to cover worst case.
    
    if len(packer.rect_list()) < len(rectangles):
        # Reset and try again with ample bins
        packer = newPacker(
            mode=PackingMode.Offline, 
            pack_algo=MaxRectsBssf, 
            rotation=False
        )
        
        # Add enough pages (worst case: 1 page per image)
        for _ in range(len(rectangles)):
            packer.add_bin(bin_w, bin_h)
            
        for w, h, img_id in rectangles:
            packer.add_rect(w, h, img_id)
            
        packer.pack()

    layout = {}

    for bin_id, x, y, w, h, img_id in packer.rect_list():
        img = images_db[img_id]
        
        # Calculate actual rendered width (removing the gap padding we added)
        actual_width = w - gap
        actual_height = h - gap
        
        layout.setdefault(bin_id + 1, []).append({
            "image_id": img_id,
            "x": x + margin,
            "y": y + margin,
            "width": actual_width,
            "height": actual_height,
            "url": f"http://localhost:5001/output/{img_id}.{img['ext']}"
        })

    return layout

# ... existing imports ...

# =========================
# DELETE API
# =========================
@app.route("/delete_image", methods=["POST"])
def delete_image():
    try:
        data = request.get_json()
        img_id = data.get("image_id")

        if not img_id:
            return jsonify({"error": "Missing image_id"}), 400
            
        if img_id not in images_db:
            # Even if not in DB, try to delete file if it exists (cleanup)
            # But normally we return 404. For robustness, let's just say success.
            return jsonify({"message": "Image not found, assuming deleted"}), 200

        # Get file info
        img_data = images_db[img_id]
        file_path = img_data["path"]

        # 1. Remove from Disk
        if os.path.exists(file_path):
            os.remove(file_path)

        # 2. Remove from DB
        del images_db[img_id]

        return jsonify({"message": "Deleted successfully", "id": img_id})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
        
# =========================
# RUN
# =========================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)