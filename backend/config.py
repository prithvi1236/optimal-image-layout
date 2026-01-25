"""
Configuration settings for the application
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- APPLICATION CONFIGURATION ---
A4_WIDTH, A4_HEIGHT = 794, 1123
TEMP_UPLOAD_FOLDER = "temp_uploads"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# --- SUPABASE CONFIGURATION ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
SUPABASE_BUCKET = "assets"

# --- PERFORMANCE CONFIGURATION ---
CPU_COUNT = os.cpu_count() or 1
MAX_UPLOAD_WORKERS = min(16, CPU_COUNT * 4)  # I/O bound
MAX_CV2_WORKERS = min(8, CPU_COUNT)  # CPU bound

# --- CORS CONFIGURATION ---
CORS_ORIGINS = ["http://localhost:5173"]
CORS_HEADERS = ["Content-Type", "Authorization"]

# Ensure temp directory exists
os.makedirs(TEMP_UPLOAD_FOLDER, exist_ok=True)