"""
Image proxy routes for serving images with proper CORS headers
"""
import requests
from flask import Blueprint, Response, request, jsonify
from auth import get_user_id_from_auth
from database import get_supabase_client

image_proxy_bp = Blueprint('image_proxy', __name__)

@image_proxy_bp.route("/image_proxy", methods=["GET"])
def proxy_image():
    """Proxy images with proper CORS headers for PDF export"""
    user_id = get_user_id_from_auth()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    image_url = request.args.get('url')
    if not image_url:
        return jsonify({"error": "Missing url parameter"}), 400
    
    try:
        # Verify the image belongs to the user by checking if it's in their images
        supabase = get_supabase_client()
        # Extract the storage path from the URL to verify ownership
        if '/storage/v1/object/public/assets/' in image_url:
            storage_path = image_url.split('/storage/v1/object/public/assets/')[-1]
            
            # Check if this image belongs to the user
            result = supabase.table("images").select("id").eq("user_id", user_id).eq("storage_path", storage_path).execute()
            
            if not result.data:
                return jsonify({"error": "Image not found or unauthorized"}), 404
        
        # Fetch the image
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        
        # Return the image with proper CORS headers
        return Response(
            response.content,
            mimetype=response.headers.get('content-type', 'image/jpeg'),
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Cache-Control': 'public, max-age=3600'
            }
        )
        
    except requests.RequestException as e:
        return jsonify({"error": f"Failed to fetch image: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500