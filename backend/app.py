from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image, ImageDraw
import os
import uuid

from rectpack import newPacker

app = Flask(__name__)
CORS(app)  # IMPORTANT for localhost:5173 → localhost:5000

UPLOAD_DIR = "uploads"
PREVIEW_DIR = "previews"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

# A4 size at 300 DPI
A4_WIDTH = 2480
A4_HEIGHT = 3508


# -----------------------------
# Upload image
# -----------------------------
@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file"}), 400

    img_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower()
    path = os.path.join(UPLOAD_DIR, f"{img_id}.{ext}")
    file.save(path)

    img = Image.open(path)

    return jsonify({
        "id": img_id,
        "path": path,
        "width": img.width,
        "height": img.height,
        "ext": ext
    })


# -----------------------------
# Auto layout images on A4
# -----------------------------
@app.route("/layout", methods=["POST"])
def layout():
    images = request.json.get("images", [])

    if not images:
        return jsonify({"pages": 0, "previews": []})

    packer = newPacker(rotation=False)

    # Add ONE A4 page initially
    packer.add_bin(A4_WIDTH, A4_HEIGHT)

    # ---- SCALE IMAGES TO FIT A4 ----
    for img in images:
        w = img["width"]
        h = img["height"]

        scale = min(A4_WIDTH / w, A4_HEIGHT / h, 1.0)

        packed_w = int(w * scale)
        packed_h = int(h * scale)

        img["packed_w"] = packed_w
        img["packed_h"] = packed_h

        packer.add_rect(packed_w, packed_h, rid=img["id"])

    packer.pack()

    previews = []
    page_count = 0

    for bin_index, abin in enumerate(packer):
        if not abin:
            continue

        page_count += 1

        # Create white A4 canvas
        page = Image.new("RGB", (A4_WIDTH, A4_HEIGHT), "white")
        draw = ImageDraw.Draw(page)

        for rect in abin:
            x, y, w, h, rid = rect

            # Find image
            img_data = next(i for i in images if i["id"] == rid)
            img = Image.open(img_data["path"])

            img = img.resize((w, h))
            page.paste(img, (x, y))

            # Optional border (helps debugging)
            draw.rectangle(
                [x, y, x + w, y + h],
                outline="black",
                width=2
            )

        preview_name = f"preview_{bin_index}.png"
        preview_path = os.path.join(PREVIEW_DIR, preview_name)
        page.save(preview_path)

        previews.append({
            "page": bin_index + 1,
            "preview": preview_name
        })

    return jsonify({
        "pages": page_count,
        "previews": previews
    })


# -----------------------------
# Serve preview images
# -----------------------------
@app.route("/preview/<name>")
def preview(name):
    return app.send_static_file(f"../{PREVIEW_DIR}/{name}")


if __name__ == "__main__":
    app.run(debug=True)
