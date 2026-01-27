"""
User Data Cleanup Service
Handles automatic cleanup of inactive users and manual cleanup operations
"""

import os
import time
import threading
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from supabase import Client
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CleanupService:
    _instance = None
    
    def __init__(self, supabase_client: Client, bucket_name: str = "assets"):
        if CleanupService._instance is not None:
            raise Exception("CleanupService is a singleton. Use get_instance() method.")
        
        self.supabase = supabase_client
        self.bucket_name = bucket_name
        self.cleanup_interval = 300  # 5 minutes
        self.inactivity_threshold = 3600  # 1 hour in seconds
        self._cleanup_thread = None
        self._stop_cleanup = False
        CleanupService._instance = self
    
    @classmethod
    def get_instance(cls):
        """Get the singleton instance"""
        return cls._instance
    
    @classmethod
    def create_instance(cls, supabase_client: Client, bucket_name: str = "assets"):
        """Create the singleton instance"""
        if cls._instance is None:
            cls._instance = cls(supabase_client, bucket_name)
        return cls._instance
        
    def start_cleanup_scheduler(self):
        """Start the background cleanup scheduler"""
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            logger.info("Cleanup scheduler already running")
            return
            
        self._stop_cleanup = False
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()
        logger.info("Cleanup scheduler started")
    
    def stop_cleanup_scheduler(self):
        """Stop the background cleanup scheduler"""
        self._stop_cleanup = True
        if self._cleanup_thread:
            self._cleanup_thread.join(timeout=5)
        logger.info("Cleanup scheduler stopped")

    def hard_delete_user_data(self, user_id):
        """Synchronous permanent deletion for the UI button - No activity table needed"""
        try:
            # 1. First, get the list of files to delete from storage
            res = self.supabase.table("images").select("storage_path").eq("user_id", user_id).execute()
            paths = [item["storage_path"] for item in res.data]

            # 2. Wipe the physical files from Supabase Storage
            if paths:
                self.supabase.storage.from_("assets").remove(paths)

            # 3. Wipe the database rows
            # This is the final step to ensure no 'ghost' metadata remains
            self.supabase.table("images").delete().eq("user_id", user_id).execute()
            
            print(f"✅ Data for {user_id} has been completely wiped.")
        except Exception as e:
            print(f"❌ Error during manual delete: {e}")
            raise e
    
    def _cleanup_loop(self):
        """Background loop that runs cleanup periodically"""
        while not self._stop_cleanup:
            try:
                self.cleanup_inactive_users()
                time.sleep(self.cleanup_interval)
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
                time.sleep(self.cleanup_interval)
    
    def update_user_activity(self, user_id: str) -> bool:
        """Update user's last activity timestamp"""
        try:
            # Call the database function to update activity
            result = self.supabase.rpc('update_user_activity', {'p_user_id': user_id}).execute()
            logger.debug(f"Updated activity for user {user_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to update user activity for {user_id}: {e}")
            return False
    
    def cleanup_inactive_users(self) -> int:
        """Clean up users who have been inactive for more than 1 hour"""
        try:
            # Get inactive users
            inactive_users = self._get_inactive_users()
            cleanup_count = 0
            
            for user_data in inactive_users:
                user_id = user_data['user_id']
                if self._cleanup_user_storage_files(user_id):
                    # Call database function to cleanup user data
                    result = self.supabase.rpc('cleanup_user_data', {'p_user_id': user_id}).execute()
                    cleanup_count += 1
                    logger.info(f"Cleaned up inactive user: {user_id}")
            
            if cleanup_count > 0:
                logger.info(f"Cleaned up {cleanup_count} inactive users")
            
            return cleanup_count
            
        except Exception as e:
            logger.error(f"Error during inactive user cleanup: {e}")
            return 0
    
    def cleanup_user_data(self, user_id: str) -> bool:
        """Manually cleanup all data for a specific user (logout/delete)"""
        try:
            # Clean up storage files
            storage_cleaned = self._cleanup_user_storage_files(user_id)
            
            # Clean up database records
            result = self.supabase.rpc('cleanup_user_data', {'p_user_id': user_id}).execute()
            
            logger.info(f"Manual cleanup completed for user: {user_id}")
            return storage_cleaned
            
        except Exception as e:
            logger.error(f"Error during manual user cleanup for {user_id}: {e}")
            return False
    
    def _get_inactive_users(self) -> List[Dict]:
        """Get list of users inactive for more than 1 hour"""
        try:
            # Query users with last activity > 1 hour ago
            result = self.supabase.table('user_sessions').select('user_id').lt(
                'last_activity', 
                (datetime.now() - timedelta(hours=1)).isoformat()
            ).execute()
            
            return result.data
            
        except Exception as e:
            logger.error(f"Error getting inactive users: {e}")
            return []
    
    def _cleanup_user_storage_files(self, user_id: str) -> bool:
        """Remove all storage files for a user"""
        try:
            # Get all user images to find storage paths
            images_result = self.supabase.table('images').select('storage_path').eq('user_id', user_id).execute()
            
            if not images_result.data:
                return True  # No files to clean up
            
            # Collect all storage paths
            storage_paths = [img['storage_path'] for img in images_result.data]
            
            # Remove files from storage
            if storage_paths:
                self.supabase.storage.from_(self.bucket_name).remove(storage_paths)
                logger.debug(f"Removed {len(storage_paths)} files for user {user_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error cleaning up storage files for user {user_id}: {e}")
            return False
    
    def get_user_activity_status(self, user_id: str) -> Optional[Dict]:
        """Get user's activity status"""
        try:
            result = self.supabase.table('user_sessions').select('*').eq('user_id', user_id).single().execute()
            
            if result.data:
                last_activity = datetime.fromisoformat(result.data['last_activity'].replace('Z', '+00:00'))
                inactive_duration = (datetime.now() - last_activity.replace(tzinfo=None)).total_seconds()
                
                return {
                    'user_id': user_id,
                    'last_activity': result.data['last_activity'],
                    'inactive_duration_seconds': inactive_duration,
                    'is_inactive': inactive_duration > self.inactivity_threshold
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting user activity status for {user_id}: {e}")
            return None