import os
import io
import uuid
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

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "output"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# =========================
# APP SETUP
# =========================
app = Flask(__name__)

CORS(
    app,
    resources={r"/*": {"origins": [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]}},
    supports_credentials=False
)

# =========================
# IN-MEMORY DATABASE
# =========================
images_db = {}

# =========================
# HELPER FUNCTIONS
# =========================
def extract_images_from_pdf(pdf_path):
    extracted_data = []
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

            extracted_data.append({
                "id": img_id,
                "width": image.width,
                "height": image.height
            })

    doc.close()
    return extracted_data

# =========================
# ROUTES
# =========================

@app.route("/")
def home():
    return "Smart Layout Backend Running"

@app.route("/output/<filename>")
def get_image(filename):
    return send_from_directory(OUTPUT_FOLDER, filename)

@app.route("/extract_img", methods=["POST"])
def extract_img():
    try:
        # Check for multiple files
        if "files" not in request.files:
            return jsonify({"error": "No files uploaded"}), 400

        files = request.files.getlist("files")
        response_images = []

        for file in files:
            filename = file.filename
            ext = os.path.splitext(filename)[1].lower()
            temp_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(temp_path)

            if ext == ".pdf":
                pdf_imgs = extract_images_from_pdf(temp_path)
                response_images.extend(pdf_imgs)

            elif ext in [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".webp"]:
                image = Image.open(temp_path)
                img_id = str(uuid.uuid4())
                save_ext = ext[1:] if ext != ".jpeg" else "jpg"
                img_path = os.path.join(OUTPUT_FOLDER, f"{img_id}.{save_ext}")
                
                image.save(img_path)

                images_db[img_id] = {
                    "path": img_path,
                    "width": image.width,
                    "height": image.height,
                    "ext": save_ext
                }

                response_images.append({
                    "id": img_id,
                    "width": image.width,
                    "height": image.height
                })

        return jsonify({"images": response_images})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/delete_image", methods=["POST"])
def delete_image():
    try:
        data = request.get_json()
        img_id = data.get("image_id")

        if not img_id:
            return jsonify({"error": "Missing image_id"}), 400

        if img_id in images_db:
            file_path = images_db[img_id]["path"]
            if os.path.exists(file_path):
                os.remove(file_path)
            del images_db[img_id]
        
        return jsonify({"message": "Deleted successfully", "id": img_id})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# =========================
# LAYOUT ALGORITHM
# =========================
@app.route("/layout", methods=["POST"])
def create_layout():
    try:
        data = request.get_json()
        items = data.get("items", [])
        margin = data.get("margin", 40)
        gap = data.get("gap", 20)

        rectangles = []

        # Process in order to respect frontend priority
        for item in items:
            img_id = item.get("id")
            scale = item.get("scale", 1.0)
            
            img_entry = images_db.get(img_id)
            if not img_entry:
                continue

            w = int(img_entry["width"] * scale) + gap
            h = int(img_entry["height"] * scale) + gap
            
            rectangles.append((w, h, img_id))

        layout_result = pack_rectangles(
            rectangles,
            A4_WIDTH - 2 * margin,
            A4_HEIGHT - 2 * margin,
            margin,
            gap
        )

        return jsonify({
            "page_count": len(layout_result),
            "layout": layout_result
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

def pack_rectangles(rectangles, bin_w, bin_h, margin, gap):
    # SORT_NONE is crucial for respecting user drag-and-drop order
    packer = newPacker(
        mode=PackingMode.Offline,
        pack_algo=MaxRectsBssf,
        rotation=False,
        sort_algo=SORT_NONE 
    )

    packer.add_bin(bin_w, bin_h)

    for w, h, img_id in rectangles:
        packer.add_rect(w, h, img_id)

    packer.pack()

    # Retry if items didn't fit
    if len(packer.rect_list()) < len(rectangles):
        packer = newPacker(
            mode=PackingMode.Offline,
            pack_algo=MaxRectsBssf,
            rotation=False,
            sort_algo=SORT_NONE
        )
        for _ in range(len(rectangles)):
            packer.add_bin(bin_w, bin_h)
            
        for w, h, img_id in rectangles:
            packer.add_rect(w, h, img_id)
            
        packer.pack()

    return build_layout_response(packer, margin, gap)

def build_layout_response(packer, margin, gap):
    layout = {}
    for bin_id, x, y, w, h, img_id in packer.rect_list():
        img_entry = images_db.get(img_id)
        if not img_entry:
            continue
            
        layout.setdefault(bin_id + 1, []).append({
            "image_id": img_id,
            "x": x + margin,
            "y": y + margin,
            "width": w - gap,
            "height": h - gap,
            "url": f"http://localhost:5001/output/{img_id}.{img_entry['ext']}"
        })
    return layout

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)