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
A4_WIDTH = 794
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
            img_path = os.path.join(OUTPUT_FOLDER, f"{img_id}.{ext}")

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
        filename = file.filename
        ext = os.path.splitext(filename)[1].lower()
        temp_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(temp_path)

        image_ids = []

        if ext == ".pdf":
            image_ids = extract_images_from_pdf(temp_path)

        elif ext in [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff"]:
            image = Image.open(temp_path)
            img_id = str(uuid.uuid4())
            img_path = os.path.join(OUTPUT_FOLDER, f"{img_id}{ext}")
            image.save(img_path)

            images_db[img_id] = {
                "path": img_path,
                "width": image.width,
                "height": image.height,
                "ext": ext[1:]
            }

            image_ids.append(img_id)

        else:
            return jsonify({"error": "Unsupported file type"}), 400

        return jsonify({"image_ids": image_ids})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# =========================
# LAYOUT API
# =========================
@app.route("/layout", methods=["POST"])
def create_layout():
    try:
        data = request.get_json()

        image_ids = data.get("image_ids", [])
        margin = data.get("margin", 40)
        gap = data.get("gap", 20)
        scale = data.get("default_scale", 0.5)

        rectangles = []

        for img_id in image_ids:
            img = images_db.get(img_id)
            if not img:
                continue

            w = int(img["width"] * scale) + gap
            h = int(img["height"] * scale) + gap
            rectangles.append((img_id, w, h))

        layout = pack_rectangles(
            rectangles,
            A4_WIDTH - 2 * margin,
            A4_HEIGHT - 2 * margin,
            margin,
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
# MAXRECTS PACKING (CORE)
# =========================
def pack_rectangles(rectangles, bin_w, bin_h, margin, gap):
    rectangles.sort(key=lambda r: r[1] * r[2], reverse=True)

    # 🔥 PASS 1: try fitting everything in ONE page
    packer = newPacker(
        mode=PackingMode.Offline,
        pack_algo=MaxRectsBssf,
        rotation=False
    )

    packer.add_bin(bin_w, bin_h)

    for img_id, w, h in rectangles:
        packer.add_rect(w, h, img_id)

    packer.pack()

    if len(packer.rect_list()) == len(rectangles):
        return build_layout(packer, margin, gap)

    # 🔥 PASS 2: fallback to multiple pages
    packer = newPacker(
        mode=PackingMode.Offline,
        pack_algo=MaxRectsBssf,
        rotation=False
    )

    for _ in range(len(rectangles)):
        packer.add_bin(bin_w, bin_h)

    for img_id, w, h in rectangles:
        packer.add_rect(w, h, img_id)

    packer.pack()

    return build_layout(packer, margin, gap)

def build_layout(packer, margin, gap):
    layout = {}

    for bin_id, x, y, w, h, img_id in packer.rect_list():
        img = images_db[img_id]
        layout.setdefault(bin_id + 1, []).append({
            "image_id": img_id,
            "x": x + margin,
            "y": y + margin,
            "width": w - gap,
            "height": h - gap,
            "url": f"http://localhost:5001/output/{img_id}.{img['ext']}"
        })

    return layout

# =========================
# RUN
# =========================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)