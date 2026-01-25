"""
Storage service for handling file uploads to Supabase
"""
from typing import Dict, Any, Optional
from database import get_supabase_client
from config import SUPABASE_BUCKET

def upload_image_to_storage(user_id: str, img_id: str, ext: str, data: bytes, width: int, height: int) -> Optional[Dict[str, Any]]:
    """Upload single image to Supabase Storage"""
    supabase = get_supabase_client()
    path = f"users/{user_id}/{img_id}.{ext}"
    
    try:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path, data, {"upsert": "true", "content-type": f"image/{ext}"}
        )
        res = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)
        public_url = res if isinstance(res, str) else res.get("publicUrl", "")
        
        return {
            "id": img_id, 
            "user_id": user_id, 
            "storage_path": path,
            "width": width, 
            "height": height, 
            "ext": ext, 
            "url": public_url
        }
    except Exception as e:
        print(f"Upload failed: {e}")
        return None

def get_public_url(path: str) -> str:
    """Get public URL for a storage path"""
    supabase = get_supabase_client()
    res = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)
    return res if isinstance(res, str) else res.get("publicUrl", "")

def delete_storage_files(storage_paths: list) -> bool:
    """Delete multiple files from storage"""
    if not storage_paths:
        return True
        
    try:
        supabase = get_supabase_client()
        supabase.storage.from_(SUPABASE_BUCKET).remove(storage_paths)
        return True
    except Exception as e:
        print(f"Error deleting storage files: {e}")
        return False