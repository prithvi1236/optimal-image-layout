import os
import io
import uuid
import fitz                 # PyMuPDF
from PIL import Image
from flask import Flask, request, jsonify

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "output"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def extract_images_from_pdf(pdf_path):
    """
    Extract all images from a PDF and save them as image files
    """
    saved_images = []
    doc = fitz.open(pdf_path)

    for page_num in range(doc.page_count):
        page = doc.load_page(page_num)
        images = page.get_images(full=True)

        for img in images:
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]

            image = Image.open(io.BytesIO(image_bytes))
            img_name = f"{uuid.uuid4()}.png"
            img_path = os.path.join(OUTPUT_FOLDER, img_name)

            image.save(img_path)
            saved_images.append(img_path)

    doc.close()
    return saved_images


@app.route("/")
def home():
    return "PDF Image Extraction Backend Running"


@app.route("/extract_img", methods=["POST"])
def extract_img():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    filename = file.filename
    file_ext = os.path.splitext(filename)[1].lower()  # Get extension

    # Save file temporarily
    temp_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(temp_path)

    saved_images = []

    if file_ext == ".pdf":
        # Extract images from PDF
        saved_images = extract_images_from_pdf(temp_path)
    elif file_ext in [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff"]:
        # It's an image, just save to output folder
        img_name = f"{uuid.uuid4()}{file_ext}"
        img_path = os.path.join(OUTPUT_FOLDER, img_name)
        image = Image.open(temp_path)
        image.save(img_path)
        saved_images.append(img_path)
    else:
        return jsonify({"error": "Unsupported file type"}), 400

    return jsonify({
        "message": "File processed successfully",
        "count": len(saved_images),
        "images": saved_images
    })


if __name__ == "__main__":
    app.run(debug=True)
