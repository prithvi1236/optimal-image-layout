-- =============================================================================
-- SUPABASE SETUP FOR AUTHENTICATED IMAGE LAYOUT APPLICATION
-- =============================================================================

-- Create images table (USER-BASED)
CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    ext TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);
CREATE INDEX IF NOT EXISTS idx_images_user_created ON images(user_id, created_at);

-- ENABLE Row Level Security
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own images"
ON images
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own images"
ON images
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own images"
ON images
FOR DELETE
USING (auth.uid() = user_id);

-- Done
SELECT 'Secure user-based image storage enabled!' as status;
