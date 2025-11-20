-- Migration: Add player activity tracking columns to game_players table
-- Enables persistent tracking of player connection state and heartbeat timestamps
-- This complements Supabase Realtime Presence for robustness against network issues

-- Add activity tracking columns
ALTER TABLE game_players
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT now();

-- Add comment explaining is_active usage
COMMENT ON COLUMN game_players.is_active IS 'Set to false when player disconnects or closes browser. Used for presence tracking and auto-cleanup.';

-- Add comment explaining last_seen usage
COMMENT ON COLUMN game_players.last_seen IS 'Updated every 30 seconds via heartbeat pings from client. Used to detect stale connections.';

-- Create index for efficient activity queries
CREATE INDEX IF NOT EXISTS idx_game_players_activity ON game_players(game_id, is_active);

-- Update existing rows to set is_active = true and last_seen = now()
UPDATE game_players
SET is_active = true, last_seen = now()
WHERE is_active IS NULL OR last_seen IS NULL;
