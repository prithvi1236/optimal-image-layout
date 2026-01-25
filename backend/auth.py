"""
Authentication utilities
"""
from flask import request
from database import get_supabase_client

def get_user_id_from_auth():
    """Extract user ID from Authorization header"""
    auth_header = request.headers.get("Authorization")
    if not auth_header: 
        return None
    
    try:
        token = auth_header.replace("Bearer ", "")
        supabase = get_supabase_client()
        user = supabase.auth.get_user(token)
        user_id = user.user.id if user and user.user else None
        
        # Update user activity whenever they make an authenticated request
        if user_id:
            from cleanup_service import CleanupService
            cleanup_service = CleanupService.get_instance()
            if cleanup_service:
                cleanup_service.update_user_activity(user_id)
                
        return user_id
    except Exception:
        return None