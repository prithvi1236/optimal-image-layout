"""
Cleanup and user data management routes
"""
import time
from flask import Blueprint, request, jsonify
from auth import get_user_id_from_auth
from cleanup_service import CleanupService

cleanup_bp = Blueprint('cleanup', __name__)

@cleanup_bp.route("/logout", methods=["POST"])
def logout_user():
    """Handle user logout and cleanup their data"""
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        cleanup_service = CleanupService.get_instance()
        if cleanup_service:
            cleanup_service.cleanup_user_data(user_id)
        return jsonify({"success": True, "message": "User data cleaned up successfully"})
    except Exception as e:
        print(f"Logout cleanup error: {e}")
        return jsonify({"error": str(e)}), 500

@cleanup_bp.route("/delete_all_data", methods=["POST"])
def delete_all_user_data():
    """Handle manual deletion of all user data (dustbin button)"""
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        cleanup_service = CleanupService.get_instance()
        if cleanup_service:
            cleanup_service.cleanup_user_data(user_id)
        return jsonify({"success": True, "message": "All user data deleted successfully"})
    except Exception as e:
        print(f"Delete all data error: {e}")
        return jsonify({"error": str(e)}), 500

@cleanup_bp.route("/user_activity", methods=["GET"])
def get_user_activity():
    """Get user activity status"""
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        cleanup_service = CleanupService.get_instance()
        if cleanup_service:
            activity_status = cleanup_service.get_user_activity_status(user_id)
            return jsonify(activity_status or {"message": "No activity data found"})
        return jsonify({"error": "Cleanup service not available"}), 500
    except Exception as e:
        print(f"Get user activity error: {e}")
        return jsonify({"error": str(e)}), 500

@cleanup_bp.route("/ping", methods=["POST"])
def ping_activity():
    """Update user activity (heartbeat endpoint)"""
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        cleanup_service = CleanupService.get_instance()
        if cleanup_service:
            cleanup_service.update_user_activity(user_id)
        return jsonify({"success": True, "timestamp": time.time()})
    except Exception as e:
        print(f"Ping activity error: {e}")
        return jsonify({"error": str(e)}), 500

@cleanup_bp.route("/cleanup_stats", methods=["GET"])
def get_cleanup_stats():
    """Get cleanup statistics (admin/debug endpoint)"""
    user_id = get_user_id_from_auth()
    if not user_id: 
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        cleanup_service = CleanupService.get_instance()
        if cleanup_service:
            # Manual cleanup run for testing
            cleaned_count = cleanup_service.cleanup_inactive_users()
            return jsonify({
                "cleaned_users": cleaned_count,
                "cleanup_interval": cleanup_service.cleanup_interval,
                "inactivity_threshold": cleanup_service.inactivity_threshold
            })
        return jsonify({"error": "Cleanup service not available"}), 500
    except Exception as e:
        print(f"Get cleanup stats error: {e}")
        return jsonify({"error": str(e)}), 500