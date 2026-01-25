"""
User data management routes
"""
from flask import Blueprint, request, jsonify
from auth import get_user_id_from_auth
from database import get_supabase_client
from services.storage_service import get_public_url
from config import A4_WIDTH, A4_HEIGHT

user_bp = Blueprint('user', __name__)

@user_bp.route("/user_images", methods=["GET"])
def get_user_images():
    """Get all images for the authenticated user"""
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        supabase = get_supabase_client()
        res = supabase.table("images").select("*").eq("user_id", user_id).execute()
        
        data = []
        for img in res.data:
            orig_w, orig_h = img["width"], img["height"]
            safe_w, safe_h = A4_WIDTH - 80, A4_HEIGHT - 80
            scale = min(1.0, safe_w/orig_w, safe_h/orig_h)
            
            data.append({
                "id": img["id"], 
                "url": get_public_url(img["storage_path"]),
                "scale": scale, 
                "origW": orig_w, 
                "origH": orig_h
            })
        
        return jsonify({"images": data})
    except Exception as e:
        print(f"Error fetching user images: {e}")
        return jsonify({"error": "Failed to fetch images"}), 500

@user_bp.route("/delete_image", methods=["POST"])
def delete_image():
    """Delete a specific image"""
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        img_id = request.json.get("image_id")
        if not img_id:
            return jsonify({"error": "Missing image_id"}), 400
            
        supabase = get_supabase_client()
        
        # Get image info
        img = supabase.table("images").select("storage_path").eq("id", img_id).eq("user_id", user_id).single().execute()
        
        if img.data:
            # Delete from storage
            supabase.storage.from_("assets").remove([img.data["storage_path"]])
            # Delete from database
            supabase.table("images").delete().eq("id", img_id).execute()
            
        return jsonify({"success": True})
    except Exception as e:
        print(f"Error deleting image: {e}")
        return jsonify({"error": "Failed to delete image"}), 500