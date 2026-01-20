import os
import io
import uuid
import traceback
import time
import re
from datetime import datetime, timedelta

import fitz  # PyMuPDF
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from rectpack import newPacker, PackingMode, MaxRectsBssf, SORT_NONE
import cv2
import numpy as np

from supabase import create_client, Client 

# =========================
# CONFIGURATION
# =========================

A4_WIDTH = 794
A4_HEIGHT = 1123

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Ensure SUPABASE_URL has trailing slash for storage operations
if SUPABASE_URL and not SUPABASE_URL.endswith('/'):
    SUPABASE_URL = SUPABASE_URL + '/'

# Use service key if available (bypasses RLS), otherwise use anon key
SUPABASE_KEY_TO_USE = SUPABASE_SERVICE_KEY if SUPABASE_SERVICE_KEY else SUPABASE_ANON_KEY

# Bucket name where images will be stored
SUPABASE_BUCKET = "assets"

# Local temp dir (only for transient processing)
TEMP_UPLOAD_FOLDER = "temp_uploads"
os.makedirs(TEMP_UPLOAD_FOLDER, exist_ok=True)

# Session configuration
SESSION_TIMEOUT_HOURS = 24  # Sessions expire after 24 hours
MAX_IMAGES_PER_SESSION = 100  # Limit images per session
MAX_FILE_SIZE_MB = 50  # Max file size in MB

# Rate limiting (simple in-memory store)
rate_limit_store = {}
RATE_LIMIT_REQUESTS = 100  # Max requests per hour per session
RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds

# Bucket initialization flag
_bucket_initialized = False

# =========================
# SUPABASE CLIENT
# =========================

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY_TO_USE)

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
# HELPER: ANONYMOUS USER / SESSION
# =========================

def validate_session_id(session_id: str) -> bool:
    """
    Validate session ID format for security.
    Should be a valid UUID format.
    """
    if not session_id or len(session_id) != 36:
        return False
    
    # Check UUID format
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(session_id))


def check_rate_limit(session_id: str) -> bool:
    """
    Simple rate limiting per session.
    Returns True if request is allowed, False if rate limited.
    """
    current_time = time.time()
    
    if session_id not in rate_limit_store:
        rate_limit_store[session_id] = []
    
    # Clean old requests outside the window
    rate_limit_store[session_id] = [
        req_time for req_time in rate_limit_store[session_id]
        if current_time - req_time < RATE_LIMIT_WINDOW
    ]
    
    # Check if under limit
    if len(rate_limit_store[session_id]) >= RATE_LIMIT_REQUESTS:
        return False
    
    # Add current request
    rate_limit_store[session_id].append(current_time)
    return True


def get_session_id():
    """
    Get or create session ID with proper validation.
    Frontend should send a stable session identifier via X-Session-Id header.
    """
    sid = request.headers.get("X-Session-Id")
    
    # If no session ID provided, return error - don't auto-generate
    if not sid:
        return None, "Missing session ID. Please provide X-Session-Id header."
    
    # Validate session ID format
    if not validate_session_id(sid):
        return None, "Invalid session ID format. Must be a valid UUID."
    
    # Check rate limiting
    if not check_rate_limit(sid):
        return None, "Rate limit exceeded. Please try again later."
    
    return sid, None


def cleanup_expired_sessions():
    """
    Clean up expired sessions from database and storage.
    This should be called periodically (e.g., via cron job).
    """
    try:
        cutoff_time = datetime.now() - timedelta(hours=SESSION_TIMEOUT_HOURS)
        
        # Get expired sessions
        res = (
            supabase.table("images")
            .select("session_id, storage_path")
            .lt("created_at", cutoff_time.isoformat())
            .execute()
        )
        
        if res.data:
            # Group by session for batch operations
            sessions_to_clean = {}
            for row in res.data:
                session_id = row["session_id"]
                if session_id not in sessions_to_clean:
                    sessions_to_clean[session_id] = []
                sessions_to_clean[session_id].append(row["storage_path"])
            
            # Delete from storage and database
            for session_id, storage_paths in sessions_to_clean.items():
                try:
                    # Delete from storage
                    supabase.storage.from_(SUPABASE_BUCKET).remove(storage_paths)
                    
                    # Delete from database
                    supabase.table("images").delete().eq("session_id", session_id).execute()
                    
                    print(f"Cleaned up session {session_id}: {len(storage_paths)} files")
                except Exception as e:
                    print(f"Error cleaning session {session_id}: {e}")
    
    except Exception as e:
        print(f"Error in cleanup_expired_sessions: {e}")


def get_session_image_count(session_id: str) -> int:
    """
    Get the number of images for a session.
    """
    try:
        res = (
            supabase.table("images")
            .select("id", count="exact")
            .eq("session_id", session_id)
            .execute()
        )
        # supabase-py response shapes vary by version; don't assume `.count` exists.
        count = getattr(res, "count", None)
        if isinstance(res, dict):
            count = res.get("count")

        if isinstance(count, int):
            return count
        # Some versions may only return data; fall back to len(data) (not exact if paginated)
        data = getattr(res, "data", None)
        if isinstance(res, dict):
            data = res.get("data")
        if isinstance(data, list):
            return len(data)
        return 0
    except Exception:
        return 0

# =========================
# HELPER: SUPABASE STORAGE
# =========================

# =========================
# HELPER: SUPABASE STORAGE
# =========================

def ensure_bucket_exists():
    """
    Ensure the storage bucket exists, create it if it doesn't.
    This should be called once during app initialization.
    """
    global _bucket_initialized
    
    if _bucket_initialized:
        return
    
    try:
        # Try to list buckets to check if our bucket exists
        buckets = supabase.storage.list_buckets()
        bucket_names = [bucket.name for bucket in buckets]
        
        if SUPABASE_BUCKET not in bucket_names:
            # Create the bucket if it doesn't exist
            print(f"Creating storage bucket: {SUPABASE_BUCKET}")
            supabase.storage.create_bucket(SUPABASE_BUCKET, {
                "public": True,  # Make bucket public for easier access
                "allowedMimeTypes": ["image/*", "application/pdf"],
                "fileSizeLimit": MAX_FILE_SIZE_MB * 1024 * 1024
            })
            print(f"Successfully created bucket: {SUPABASE_BUCKET}")
        else:
            print(f"Bucket {SUPABASE_BUCKET} already exists")
            
        _bucket_initialized = True
        
    except Exception as e:
        print(f"Warning: Could not initialize bucket {SUPABASE_BUCKET}: {e}")
        print("Please create the bucket manually in your Supabase dashboard")
        # Don't raise error here - let the app continue and fail on actual upload
        # This allows the app to start even if bucket creation fails


def upload_bytes_to_supabase_storage(session_id: str, img_id: str, ext: str, data: bytes) -> str:
    """
    Uploads raw bytes to Supabase Storage and returns the storage path.
    """
    # Ensure bucket exists before attempting upload
    ensure_bucket_exists()
    
    # Example path: anonymous/<session_id>/<img_id>.ext
    path = f"anonymous/{session_id}/{img_id}.{ext}"

    try:
        # Upload with proper file options - upsert should be string, not boolean
        file_options = {
            "upsert": "true",  # String instead of boolean
            "content-type": f"image/{ext}" if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp'] else "application/octet-stream"
        }
        
        res = supabase.storage.from_(SUPABASE_BUCKET).upload(path, data, file_options)

        # Handle different response formats
        if hasattr(res, 'error') and res.error:
            raise RuntimeError(f"Supabase upload error: {res.error}")
        elif isinstance(res, dict) and "error" in res and res["error"]:
            raise RuntimeError(f"Supabase upload error: {res['error']}")
        
        return path
        
    except Exception as e:
        error_msg = str(e)
        
        # Check for specific errors
        if "Bucket not found" in error_msg:
            raise RuntimeError(
                f"Storage bucket '{SUPABASE_BUCKET}' not found. "
                f"Please create the bucket in your Supabase dashboard or check your configuration. "
                f"Original error: {error_msg}"
            )
        elif "403" in error_msg or "Forbidden" in error_msg:
            raise RuntimeError(
                f"Storage permission denied. Please ensure the '{SUPABASE_BUCKET}' bucket is public. "
                f"In Supabase dashboard: Storage > {SUPABASE_BUCKET} > Settings > Make bucket public. "
                f"Original error: {error_msg}"
            )
        
        # Try fallback upload without file options
        try:
            print(f"Upload with options failed, trying fallback: {error_msg}")
            res = supabase.storage.from_(SUPABASE_BUCKET).upload(path, data)
            
            if hasattr(res, 'error') and res.error:
                raise RuntimeError(f"Supabase upload error (fallback): {res.error}")
            elif isinstance(res, dict) and "error" in res and res["error"]:
                raise RuntimeError(f"Supabase upload error (fallback): {res['error']}")
            
            return path
            
        except Exception as fallback_error:
            fallback_msg = str(fallback_error)
            
            if "Bucket not found" in fallback_msg:
                raise RuntimeError(
                    f"Storage bucket '{SUPABASE_BUCKET}' not found. "
                    f"Please create the bucket in your Supabase dashboard. "
                    f"Go to Storage > Create new bucket > Name: '{SUPABASE_BUCKET}' > Make it public"
                )
            elif "403" in fallback_msg or "Forbidden" in fallback_msg:
                raise RuntimeError(
                    f"Storage permission denied. Please ensure the '{SUPABASE_BUCKET}' bucket is public. "
                    f"In Supabase dashboard: Storage > {SUPABASE_BUCKET} > Settings > Make bucket public"
                )
            
            raise RuntimeError(f"Supabase upload failed: {error_msg}, Fallback also failed: {fallback_msg}")


def get_public_url_from_storage(path: str) -> str:
    """
    Returns a public URL or signed URL for the given storage path.
    For simplicity, this uses public URLs; you can switch to signed URLs.
    """
    # Public URL (bucket must be public or served via CDN).
    # supabase-py return shape can vary by version, so normalize to a plain string.
    res = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)

    # Common shapes:
    #  - str
    #  - {"publicUrl": "..."}
    #  - {"data": {"publicUrl": "..."}, "error": None}
    if isinstance(res, str):
        return res

    if isinstance(res, dict):
        # Newer SDK shape
        if "data" in res and isinstance(res["data"], dict) and res["data"].get("publicUrl"):
            return res["data"]["publicUrl"]
        # Older helper shape
        if res.get("publicUrl"):
            return res["publicUrl"]

    # Fallback to string conversion (at worst returns repr so caller doesn't crash)
    return str(res)

# =========================
# HELPER: DATABASE ACCESSORS
# =========================

def db_insert_image(img_id: str, session_id: str, storage_path: str, width: int, height: int, ext: str):
    """
    Insert a row into images table.
    Schema assumption:
      images(
        id text primary key,
        session_id text,
        storage_path text,
        width int,
        height int,
        ext text,
        created_at timestamptz default now()
      )
    """
    data = {
        "id": img_id,
        "session_id": session_id,
        "storage_path": storage_path,
        "width": width,
        "height": height,
        "ext": ext
    }
    
    try:
        res = supabase.table("images").insert(data).execute()
        if hasattr(res, 'error') and res.error:
            raise RuntimeError(f"Database insert error: {res.error}")
    except Exception as e:
        error_msg = str(e)
        if "row-level security policy" in error_msg.lower():
            raise RuntimeError(
                f"Database permission error. Please run the database setup script or disable RLS on the images table. "
                f"In Supabase SQL editor, run: ALTER TABLE images DISABLE ROW LEVEL SECURITY; "
                f"Original error: {error_msg}"
            )
        else:
            raise RuntimeError(f"Database insert failed: {error_msg}")


def db_get_image(img_id: str, session_id: str):
    """
    Get image row for this session.
    """
    res = (
        supabase.table("images")
        .select("*")
        .eq("id", img_id)
        .eq("session_id", session_id)
        .single()
        .execute()
    )
    # supabase-py response shapes vary by version; avoid assuming `.error` exists.
    # We treat "no row" as None, and bubble up real exceptions.
    data = getattr(res, "data", None)
    error = getattr(res, "error", None)

    # Some versions may return dicts
    if isinstance(res, dict):
        data = res.get("data")
        error = res.get("error")

    if error:
        return None
    return data


def db_delete_image(img_id: str, session_id: str):
    """
    Delete the image row; return the deleted row's storage_path for deletion in storage.
    """
    # Get existing row first
    img = db_get_image(img_id, session_id)
    if not img:
        return None

    path = img["storage_path"]

    res = (
        supabase.table("images")
        .delete()
        .eq("id", img_id)
        .eq("session_id", session_id)
        .execute()
    )
    # supabase-py response shapes vary by version; avoid assuming `.error` exists.
    error = getattr(res, "error", None)
    if isinstance(res, dict):
        error = res.get("error")
    if error:
        raise RuntimeError(f"Supabase delete error: {error}")

    return path

# =========================
# IMAGE / PDF EXTRACTION
# =========================

def extract_images_from_pdf(pdf_path, session_id):
    """
    Extract images from PDF, upload each to Supabase, store metadata in DB.
    Returns list of metadata for frontend.
    """
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

            # Upload to Supabase Storage
            storage_path = upload_bytes_to_supabase_storage(
                session_id=session_id,
                img_id=img_id,
                ext=ext,
                data=image_bytes
            )

            # Insert DB row
            db_insert_image(
                img_id=img_id,
                session_id=session_id,
                storage_path=storage_path,
                width=image.width,
                height=image.height,
                ext=ext
            )

            extracted_data.append({
                "id": img_id,
                "width": image.width,
                "height": image.height,
                "ext": ext,
                "url": get_public_url_from_storage(storage_path)
            })

    doc.close()
    return extracted_data


def extract_figures_from_image(image_path, session_id):
    """
    Extract figure regions from a single image, upload each crop to Supabase,
    store metadata, return list of metadata.
    """
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

        if w > 150 and h > 150:
            crop = img[y:y+h, x:x+w]

            img_id = str(uuid.uuid4())
            ext = "png"

            # Encode to PNG bytes in memory
            success, buf = cv2.imencode(".png", crop)
            if not success:
                continue
            bytes_data = buf.tobytes()

            storage_path = upload_bytes_to_supabase_storage(
                session_id=session_id,
                img_id=img_id,
                ext=ext,
                data=bytes_data
            )

            db_insert_image(
                img_id=img_id,
                session_id=session_id,
                storage_path=storage_path,
                width=w,
                height=h,
                ext=ext
            )

            extracted.append({
                "id": img_id,
                "width": w,
                "height": h,
                "ext": ext,
                "url": get_public_url_from_storage(storage_path)
            })

    return extracted

# =========================
# ROUTES
# =========================

@app.route("/")
def home():
    return "A4 Layout Backend with Supabase Running"


@app.route("/health", methods=["GET"])
def health_check():
    """
    Health check endpoint that verifies Supabase connection and bucket existence.
    """
    try:
        # Check database connection
        supabase.table("images").select("id", count="exact").limit(1).execute()
        
        # Check storage bucket
        buckets = supabase.storage.list_buckets()
        bucket_names = [bucket.name for bucket in buckets]
        bucket_exists = SUPABASE_BUCKET in bucket_names
        
        return jsonify({
            "status": "healthy",
            "database": "connected",
            "storage_bucket": SUPABASE_BUCKET,
            "bucket_exists": bucket_exists,
            "bucket_url": f"{SUPABASE_URL}storage/v1/object/public/{SUPABASE_BUCKET}/" if bucket_exists else None
        })
        
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e),
            "storage_bucket": SUPABASE_BUCKET
        }), 500


@app.route("/session/create", methods=["POST"])
def create_session():
    """
    Create a new session ID for anonymous users.
    Frontend should call this once and store the session ID.
    """
    try:
        session_id = str(uuid.uuid4())
        return jsonify({
            "session_id": session_id,
            "expires_in_hours": SESSION_TIMEOUT_HOURS,
            "max_images": MAX_IMAGES_PER_SESSION
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/session/info", methods=["GET"])
def session_info():
    """
    Get information about the current session.
    """
    try:
        session_id, error = get_session_id()
        if error:
            return jsonify({"error": error}), 400
            
        image_count = get_session_image_count(session_id)
        
        return jsonify({
            "session_id": session_id,
            "image_count": image_count,
            "max_images": MAX_IMAGES_PER_SESSION,
            "remaining_images": MAX_IMAGES_PER_SESSION - image_count
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/admin/cleanup", methods=["POST"])
def admin_cleanup():
    """
    Manual cleanup endpoint for expired sessions.
    In production, this should be protected or run via cron.
    """
    try:
        cleanup_expired_sessions()
        return jsonify({"message": "Cleanup completed"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/extract_img", methods=["POST"])
def extract_img():
    """
    Upload a file (PDF/Image), extract content,
    store in Supabase Storage + DB, return metadata for frontend.
    Anonymous users are identified by session_id.
    """
    try:
        session_id, error = get_session_id()
        if error:
            return jsonify({"error": error}), 400

        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        filename = file.filename
        
        if not filename:
            return jsonify({"error": "No filename provided"}), 400
            
        # Check file size
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning
        
        if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
            return jsonify({"error": f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"}), 400
        
        # Check session image limit
        current_count = get_session_image_count(session_id)
        if current_count >= MAX_IMAGES_PER_SESSION:
            return jsonify({"error": f"Maximum {MAX_IMAGES_PER_SESSION} images per session"}), 400

        ext = os.path.splitext(filename)[1].lower()
        temp_path = os.path.join(TEMP_UPLOAD_FOLDER, f"{uuid.uuid4()}_{filename}")
        file.save(temp_path)

        response_images = []

        if ext == ".pdf":
            response_images = extract_images_from_pdf(temp_path, session_id)

        elif ext in [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".webp"]:
            image = Image.open(temp_path)

            if request.form.get("extract_figures"):
                response_images = extract_figures_from_image(temp_path, session_id)
            else:
                img_id = str(uuid.uuid4())
                save_ext = ext[1:] if ext != ".jpeg" else "jpg"

                # Save into memory
                buf = io.BytesIO()
                image.save(buf, format=image.format or "PNG")
                bytes_data = buf.getvalue()

                storage_path = upload_bytes_to_supabase_storage(
                    session_id=session_id,
                    img_id=img_id,
                    ext=save_ext,
                    data=bytes_data
                )

                db_insert_image(
                    img_id=img_id,
                    session_id=session_id,
                    storage_path=storage_path,
                    width=image.width,
                    height=image.height,
                    ext=save_ext
                )

                response_images.append({
                    "id": img_id,
                    "width": image.width,
                    "height": image.height,
                    "ext": save_ext,
                    "url": get_public_url_from_storage(storage_path)
                })

        else:
            return jsonify({"error": "Unsupported file type"}), 400

        # Best-effort cleanup
        try:
            os.remove(temp_path)
        except Exception:
            pass

        return jsonify({
            "images": response_images,
            "session_info": {
                "session_id": session_id,
                "total_images": current_count + len(response_images)
            }
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/delete_image", methods=["POST"])
def delete_image():
    """
    Delete an image from Supabase Storage and DB for this anonymous session.
    """
    try:
        session_id, error = get_session_id()
        if error:
            return jsonify({"error": error}), 400
            
        data = request.get_json()
        img_id = data.get("image_id")

        if not img_id:
            return jsonify({"error": "Missing image_id"}), 400

        storage_path = db_delete_image(img_id, session_id)
        if storage_path:
            # Delete from storage
            try:
                supabase.storage.from_(SUPABASE_BUCKET).remove([storage_path])
            except Exception as e:
                print(f"Warning: Failed to delete from storage: {e}")

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
    Generates a multi-page A4 layout based on the list of items (id, scale),
    using Supabase DB for image metadata.
    """
    try:
        session_id, error = get_session_id()
        if error:
            return jsonify({"error": error}), 400
            
        data = request.get_json()

        items = data.get("items", [])
        margin = data.get("margin", 40)
        gap = data.get("gap", 20)

        rectangles = []

        for item in items:
            img_id = item.get("id")
            scale = item.get("scale", 1.0)

            img_entry = db_get_image(img_id, session_id)
            if not img_entry:
                continue

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

        layout_result = pack_rectangles(
            rectangles,
            A4_WIDTH - 2 * margin,
            A4_HEIGHT - 2 * margin,
            margin,
            gap,
            session_id
        )

        return jsonify({
            "page_count": len(layout_result),
            "layout": layout_result
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def pack_rectangles(rectangles, bin_w, bin_h, margin, gap, session_id):
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

    return build_layout_response(packer, margin, gap, session_id)


def build_layout_response(packer, margin, gap, session_id):
    layout = {}

    for bin_id, x, y, w, h, img_id in packer.rect_list():
        img_entry = db_get_image(img_id, session_id)
        if not img_entry:
            continue

        url = get_public_url_from_storage(img_entry["storage_path"])

        layout.setdefault(bin_id + 1, []).append({
            "image_id": img_id,
            "x": x + margin,
            "y": y + margin,
            "width": w - gap,
            "height": h - gap,
            "url": url
        })

    return layout

# =========================
# MAIN
# =========================

if __name__ == "__main__":
    # Initialize bucket on startup
    print("Initializing Supabase storage...")
    ensure_bucket_exists()
    
    # For production, run with gunicorn/uvicorn, not app.run
    print("Starting Flask app...")
    app.run(host="0.0.0.0", port=5001, debug=True)
