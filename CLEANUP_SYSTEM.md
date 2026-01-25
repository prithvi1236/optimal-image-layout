# User Data Cleanup System

This system automatically manages user data cleanup based on inactivity and provides manual cleanup options.

## Features

### 🕐 Automatic Cleanup (1 Hour Inactivity)
- Tracks user activity automatically on every authenticated request
- Cleans up user data after 1 hour of inactivity
- Removes both database records and storage files
- Runs background cleanup every 5 minutes

### ⚠️ Inactivity Warning (50 Minutes)
- Shows warning modal after 50 minutes of inactivity
- Gives user 10 minutes to stay active or logout
- Resets timer when user chooses to stay active

### 🚪 Manual Logout Cleanup
- "Logout" button cleans up all user data immediately
- Signs out user from Supabase
- Removes all images and database records

### 🗑️ Manual Delete All Data
- "Delete All Data" button (dustbin icon) removes everything
- Confirmation dialog prevents accidental deletion
- Keeps user logged in but removes all their data

## Implementation

### Backend Components

1. **Database Schema** (`cleanup_schema.sql`)
   - `user_sessions` table for activity tracking
   - Database functions for cleanup operations
   - Indexes for efficient cleanup queries

2. **Cleanup Service** (`cleanup_service.py`)
   - Background scheduler for automatic cleanup
   - Activity tracking and user management
   - Storage file cleanup integration

3. **API Endpoints** (added to `app.py`)
   - `POST /logout` - Logout with data cleanup
   - `POST /delete_all_data` - Manual data deletion
   - `POST /ping` - Activity heartbeat
   - `GET /user_activity` - Activity status
   - `GET /cleanup_stats` - Cleanup statistics

### Frontend Components

1. **Cleanup Service** (`cleanupService.ts`)
   - Activity tracking with automatic pings
   - Inactivity warning system
   - Manual cleanup operations
   - User interaction detection

2. **UI Integration** (`App.tsx`, `ImageCanvas.tsx`)
   - Inactivity warning modal
   - Updated logout and delete buttons
   - Activity timer management

## Setup Instructions

### 1. Database Setup
Run the cleanup schema in your Supabase dashboard:
```sql
-- Execute the contents of cleanup_schema.sql
```

Or use the setup script:
```bash
cd backend
python setup_cleanup.py
```

### 2. Backend Dependencies
The cleanup service is automatically initialized when the Flask app starts:
```python
# Already integrated in app.py
cleanup_service = CleanupService(supabase, SUPABASE_BUCKET)
cleanup_service.start_cleanup_scheduler()
```

### 3. Frontend Integration
The cleanup service is automatically initialized:
```typescript
// Already integrated in App.tsx and ImageCanvas.tsx
import { cleanupService } from './cleanupService';
```

## Configuration

### Timing Settings
```typescript
// In cleanupService.ts
const ACTIVITY_PING_INTERVAL = 5 * 60 * 1000; // 5 minutes
const INACTIVITY_WARNING_TIME = 50 * 60 * 1000; // 50 minutes
```

```python
# In cleanup_service.py
self.cleanup_interval = 300  # 5 minutes
self.inactivity_threshold = 3600  # 1 hour
```

### Activity Tracking
The system tracks activity through:
- Authenticated API requests (automatic)
- User interactions (mouse, keyboard, scroll)
- Tab visibility changes
- Manual activity pings

## API Reference

### POST /logout
Logout user and cleanup all their data.
```javascript
const response = await fetch('/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### POST /delete_all_data
Delete all user data while keeping them logged in.
```javascript
const response = await fetch('/delete_all_data', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### POST /ping
Update user activity timestamp.
```javascript
const response = await fetch('/ping', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### GET /user_activity
Get user's activity status.
```javascript
const response = await fetch('/user_activity', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Security Features

- Row Level Security (RLS) on all tables
- User can only access their own data
- Automatic cleanup prevents data accumulation
- Secure token-based authentication

## Monitoring

### Cleanup Statistics
Access cleanup stats via the `/cleanup_stats` endpoint for monitoring:
- Number of users cleaned up
- Cleanup intervals and thresholds
- Manual cleanup trigger for testing

### Logging
The system logs all cleanup operations:
- Inactive user cleanups
- Manual data deletions
- Storage file removals
- Activity updates

## Testing

### Manual Testing
1. Login and upload some images
2. Wait 50 minutes or modify `INACTIVITY_WARNING_TIME` for faster testing
3. Verify warning modal appears
4. Test "Stay Active" and "Logout Now" buttons
5. Test manual "Delete All Data" button

### Programmatic Testing
```python
# Test cleanup service directly
from cleanup_service import CleanupService
cleanup = CleanupService(supabase_client)
cleanup.cleanup_inactive_users()
```

## Troubleshooting

### Common Issues

1. **Schema not applied**: Run the SQL manually in Supabase dashboard
2. **Cleanup not running**: Check Flask app logs for scheduler errors
3. **Activity not tracked**: Verify authentication headers are sent
4. **Storage files not deleted**: Check Supabase storage permissions

### Debug Endpoints
- `GET /cleanup_stats` - View cleanup statistics
- `GET /user_activity` - Check user activity status
- Check browser console for frontend cleanup service logs