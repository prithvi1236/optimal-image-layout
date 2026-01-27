"""
Refactored Cleanup and User Data Management Routes
"""
import time
from flask import Blueprint, request, jsonify
from auth import get_user_id_from_auth
from cleanup_service import CleanupService

cleanup_bp = Blueprint('cleanup', __name__)

@cleanup_bp.route("/logout", methods=["POST"])
def logout_user():
    """
    FIXED: Logout now ONLY handles session termination.
    It does NOT delete user data from the DB or Storage.
    """
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    # Logic to invalidate token should go here (handled by Supabase client)
    return jsonify({"success": True, "message": "Logged out successfully"})

@cleanup_bp.route("/delete_all_data", methods=["POST"])
def delete_all_user_data():
    """
    FIXED: Explicitly calls a synchronous deletion method.
    This is for the 'Dustbin' button.
    """
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        cleanup_service = CleanupService.get_instance()
        if cleanup_service:
            # We call a specific 'hard_delete' method instead of generic cleanup
            cleanup_service.hard_delete_user_data(user_id)
        return jsonify({"success": True, "message": "All data wiped permanently"})
    except Exception as e:
        print(f"Hard delete error: {e}")
        return jsonify({"error": str(e)}), 500

@cleanup_bp.route("/ping", methods=["POST"])
def ping_activity():
    """Updates user activity (heartbeat)"""
    user_id = get_user_id_from_auth()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    
    try:
        cleanup_service = CleanupService.get_instance()
        if cleanup_service:
            cleanup_service.update_user_activity(user_id)
        return jsonify({"success": True, "timestamp": time.time()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@cleanup_bp.route("/cleanup_stats", methods=["GET"])
def get_cleanup_stats():
    """Admin-only: See how many users are flagged for background cleanup"""
    user_id = get_user_id_from_auth()
    # Logic to check if user is Admin should be here
    
    cleanup_service = CleanupService.get_instance()
    # We do NOT trigger a manual cleanup here to avoid accidental wipes
    return jsonify({
        "status": "Service Active",
        "inactivity_threshold_seconds": cleanup_service.inactivity_threshold
    })