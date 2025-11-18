-- Add is_public column to games table for public/private game support
-- Run this in your Supabase SQL Editor

-- Add the column
ALTER TABLE games 
ADD COLUMN is_public boolean DEFAULT false NOT NULL;

-- Create index for efficient public game queries
CREATE INDEX idx_games_public_status ON games(is_public, status) 
WHERE status = 'waiting';

-- Create index for general status queries
CREATE INDEX idx_games_status_created ON games(status, created_at DESC);

-- Optional: Add comment for documentation
COMMENT ON COLUMN games.is_public IS 'Whether this game appears in public lobby (true) or is private/invite-only (false)';
