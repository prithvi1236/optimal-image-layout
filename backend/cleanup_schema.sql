-- =============================================================================
-- USER ACTIVITY TRACKING AND CLEANUP SCHEMA
-- =============================================================================

-- Create user_sessions table to track user activity
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    session_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Indexes for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);

-- Enable RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sessions"
ON user_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions"
ON user_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
ON user_sessions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions"
ON user_sessions
FOR DELETE
USING (auth.uid() = user_id);

-- Function to cleanup inactive users
CREATE OR REPLACE FUNCTION cleanup_inactive_users()
RETURNS INTEGER AS $$
DECLARE
    cleanup_count INTEGER;
BEGIN
    DELETE FROM images
    WHERE user_id IN (
        SELECT user_id
        FROM user_sessions
        WHERE last_activity < NOW() - INTERVAL '1 hour'
    );

    DELETE FROM user_sessions
    WHERE last_activity < NOW() - INTERVAL '1 hour'
    RETURNING 1 INTO cleanup_count;

    RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user activity
CREATE OR REPLACE FUNCTION update_user_activity(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_sessions (user_id, last_activity)
    VALUES (p_user_id, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET last_activity = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup specific user data
CREATE OR REPLACE FUNCTION cleanup_user_data(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Delete user images
    DELETE FROM images WHERE user_id = p_user_id;
    
    -- Delete user session
    DELETE FROM user_sessions WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'User activity tracking and cleanup schema created!' as status;