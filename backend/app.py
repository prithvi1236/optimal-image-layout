import os
import io
import uuid
import fitz  # PyMuPDF
import traceback
from PIL import Image
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from rectpack import newPacker, PackingMode, MaxRectsBssf, SORT_NONE
import cv2
import numpy as np



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

# Allow CORS for your React Frontend
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
# Structure: image_id -> { "path": str, "width": int, "height": int, "ext": str }
images_db = {}

# =========================
# HELPER FUNCTIONS
# =========================
def extract_images_from_pdf(pdf_path):
    """
    Extracts all images from a PDF file and saves them to the output folder.
    Returns a list of image metadata objects.
    """
    extracted_data = []
    doc = fitz.open(pdf_path)

    for page in doc:
        for img in page.get_images(full=True):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            ext = base_image["ext"]

            # Load into PIL to get dimensions and save safely
            image = Image.open(io.BytesIO(image_bytes))
            img_id = str(uuid.uuid4())
            img_path = os.path.join(OUTPUT_FOLDER, f"{img_id}.{ext}")

            image.save(img_path)

            # Store in DB
            images_db[img_id] = {
                "path": img_path,
                "width": image.width,
                "height": image.height,
                "ext": ext
            }

            extracted_data.append({
                "id": img_id,
                "width": image.width,
                "height": image.height,
                "ext": ext
            })

    doc.close()
    return extracted_data

def extract_figures_from_image(image_path):
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        15, 10
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))
    clean = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(
        clean,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    extracted = []

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)

        # filter noise / text
        if w > 150 and h > 150:
            crop = img[y:y+h, x:x+w]

            img_id = str(uuid.uuid4())
            img_path = os.path.join(OUTPUT_FOLDER, f"{img_id}.png")

            cv2.imwrite(img_path, crop)

            images_db[img_id] = {
                "path": img_path,
                "width": w,
                "height": h,
                "ext": "png"
            }

            extracted.append({
                "id": img_id,
                "width": w,
                "height": h,
                 "ext": "png"


            })

    return extracted


# =========================
# ROUTES
# =========================

@app.route("/")
def home():
    return "Final Image Layout Backend Running"

@app.route("/output/<filename>")
def get_image(filename):
    """Serves the static image files."""
    return send_from_directory(OUTPUT_FOLDER, filename)

@app.route("/extract_img", methods=["POST"])
def extract_img():
    """
    Uploads a file (PDF/Image), extracts content, saves to disk,
    and returns metadata (ID, Width, Height) for the frontend.
    """
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        filename = file.filename
        ext = os.path.splitext(filename)[1].lower()
        temp_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(temp_path)

        response_images = []

        if ext == ".pdf":
            response_images = extract_images_from_pdf(temp_path)

        elif ext in [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".webp"]:
            image = Image.open(temp_path)

            # 🔹 OPTION: extract figures instead of whole image
            if data := request.form.get("extract_figures"):
                response_images = extract_figures_from_image(temp_path)
            else:
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
    "height": image.height,
    "ext": save_ext
})




        else:
            return jsonify({"error": "Unsupported file type"}), 400

        # Return list of objects so frontend knows original W/H
        return jsonify({"images": response_images})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/delete_image", methods=["POST"])
def delete_image():
    """
    Deletes an image from the server and database.
    """
    try:
        data = request.get_json()
        img_id = data.get("image_id")

        if not img_id:
            return jsonify({"error": "Missing image_id"}), 400

        # Try to find and delete file
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
    """
    Generates a multi-page A4 layout based on the list of items provided.
    Respects the order of items and their scale factors.
    """
    try:
        data = request.get_json()

        # Input: List of { id, scale } in the desired order
        items = data.get("items", [])
        margin = data.get("margin", 40)
        gap = data.get("gap", 20)

        rectangles = []

        # 1. Prepare Rectangles
        # We process them in the exact order received to support "reorder" from frontend.
        for item in items:
            img_id = item.get("id")
            scale = item.get("scale", 1.0)
            
            img_entry = images_db.get(img_id)
            if not img_entry:
                continue

            # Calculate Scaled Dimensions
            # Add gap to the size so the packer reserves space around it
            # w = int(img_entry["width"] * scale) + gap
            # h = int(img_entry["height"] * scale) + gap
            max_h = A4_HEIGHT - 2 * margin - gap
            scaled_w = int(img_entry["width"] * scale)
            scaled_h = int(img_entry["height"] * scale)

            if scaled_h > max_h:
                ratio = max_h / scaled_h
                scaled_h = max_h
                scaled_w = int(scaled_w * ratio)

            w = scaled_w + gap
            h = scaled_h + gap

            
            rectangles.append((w, h, img_id))

        # 2. Pack Rectangles
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
    """
    Uses MaxRects algorithm to pack images into A4 bins.
    """
    # Initialize Packer with SORT_NONE to respect user order
    packer = newPacker(
        mode=PackingMode.Offline,
        pack_algo=MaxRectsBssf,
        rotation=False,
        sort_algo=SORT_NONE
    )

    # Start with one page
    packer.add_bin(bin_w, bin_h)

    # Add all images
    for w, h, img_id in rectangles:
        packer.add_rect(w, h, img_id)

    packer.pack()

    # If items didn't fit, add more pages and retry
    if len(packer.rect_list()) < len(rectangles):
        packer = newPacker(
            mode=PackingMode.Offline,
            pack_algo=MaxRectsBssf,
            rotation=False,
            sort_algo=SORT_NONE
        )
        # Add enough bins (worst case: 1 page per image)
        for _ in range(len(rectangles)):
            packer.add_bin(bin_w, bin_h)
            
        for w, h, img_id in rectangles:
            packer.add_rect(w, h, img_id)
            
        packer.pack()

    return build_layout_response(packer, margin, gap)

def build_layout_response(packer, margin, gap):
    """
    Converts packer result into the frontend JSON format.
    """
    layout = {}

    for bin_id, x, y, w, h, img_id in packer.rect_list():
        img_entry = images_db.get(img_id)
        if not img_entry:
            continue
            
        # The packer returns coordinates inside the bin (excluding margins)
        # We need to add the margins back for the final position.
        # We also subtract the 'gap' from w/h because we added it during packing.
        
        layout.setdefault(bin_id + 1, []).append({
            "image_id": img_id,
            "x": x + margin,
            "y": y + margin,
            "width": w - gap,
            "height": h - gap,
            "url": f"http://localhost:5001/output/{img_id}.{img_entry['ext']}"
        })

    return layout

# =========================
# MAIN
# =========================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
