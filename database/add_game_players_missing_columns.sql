-- Migration: Fix column mismatches in game_players table
-- This migration addresses the schema cache error: "Could not find the 'empire_color' column of 'game_players' in the schema cache"
-- It aligns the database schema with the application code in gameService.ts and supabase.ts

-- Section 1: Column Renames (Safe Operations)
-- We use DO blocks to safely rename columns only if the old name exists and new name doesn't

DO $$
BEGIN
    -- Rename color -> empire_color
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_players' AND column_name = 'color') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_players' AND column_name = 'empire_color') THEN
            ALTER TABLE game_players RENAME COLUMN color TO empire_color;
        END IF;
    END IF;

    -- Rename eliminated -> is_eliminated
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_players' AND column_name = 'eliminated') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_players' AND column_name = 'is_eliminated') THEN
            ALTER TABLE game_players RENAME COLUMN eliminated TO is_eliminated;
        END IF;
    END IF;

    -- Rename ready -> is_ready
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_players' AND column_name = 'ready') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_players' AND column_name = 'is_ready') THEN
            ALTER TABLE game_players RENAME COLUMN ready TO is_ready;
        END IF;
    END IF;
END $$;

-- Section 2: Add Missing Columns
-- We add columns that are expected by the application but missing from the schema

ALTER TABLE game_players
ADD COLUMN IF NOT EXISTS is_alive BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS systems_controlled INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS final_territory_percentage FLOAT,
ADD COLUMN IF NOT EXISTS total_troops_sent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS planets_captured INTEGER DEFAULT 0;

-- Section 3: Backfill Existing Data
-- Ensure existing records have valid values for the new NOT NULL columns

UPDATE game_players
SET is_alive = true
WHERE is_alive IS NULL;

UPDATE game_players
SET systems_controlled = 0
WHERE systems_controlled IS NULL;

UPDATE game_players
SET total_troops_sent = 0
WHERE total_troops_sent IS NULL;

UPDATE game_players
SET planets_captured = 0
WHERE planets_captured IS NULL;

-- Section 4: Add Indexes for Performance
-- Add indexes for columns frequently queried in game loops

CREATE INDEX IF NOT EXISTS idx_game_players_alive ON game_players(game_id, is_alive);
CREATE INDEX IF NOT EXISTS idx_game_players_systems ON game_players(game_id, systems_controlled);

-- Section 5: Add Column Documentation
-- Document the purpose of each column for future reference

COMMENT ON COLUMN game_players.empire_color IS 'Hex color code for the player empire (e.g., #FF0000). Renamed from color.';
COMMENT ON COLUMN game_players.is_eliminated IS 'Boolean flag if player has been eliminated. Renamed from eliminated.';
COMMENT ON COLUMN game_players.is_ready IS 'Boolean flag if player is ready in lobby. Renamed from ready.';
COMMENT ON COLUMN game_players.is_alive IS 'Tracks if player is still alive in the game. Used by game-tick function for elimination logic.';
COMMENT ON COLUMN game_players.systems_controlled IS 'Number of planets/systems currently owned by the player. Updated by gameService.ts.';
COMMENT ON COLUMN game_players.final_territory_percentage IS 'Final percentage of galaxy controlled. Populated on game completion for victory screen.';
COMMENT ON COLUMN game_players.total_troops_sent IS 'Cumulative count of troops sent in attacks. Populated by game-tick for end-game stats.';
COMMENT ON COLUMN game_players.planets_captured IS 'Cumulative count of planets captured. Populated by game-tick for end-game stats.';

-- Section 6: Verification Queries
-- Run these to verify the migration succeeded

DO $$
BEGIN
    RAISE NOTICE 'Verifying game_players columns...';
END $$;

SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'game_players' 
ORDER BY column_name;
