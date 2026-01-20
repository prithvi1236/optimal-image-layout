-- =============================================================================
-- SUPABASE SETUP FOR OPTIMAL IMAGE LAYOUT APPLICATION
-- =============================================================================
-- Copy and paste this entire script into your Supabase SQL editor and run it.

-- Create the main images table
CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    ext TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_images_session_id ON images(session_id);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);
CREATE INDEX IF NOT EXISTS idx_images_session_created ON images(session_id, created_at);

-- CRITICAL: Disable Row Level Security for anonymous access
ALTER TABLE images DISABLE ROW LEVEL SECURITY;

-- Create cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions(hours_old INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM images 
    WHERE created_at < NOW() - INTERVAL '1 hour' * hours_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Verify setup
SELECT 'Database setup complete!' as status;