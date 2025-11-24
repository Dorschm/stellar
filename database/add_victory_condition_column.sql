-- Migration: Add victory_condition column to games table
-- This stores the territory percentage required to win (default: 80%)
--
-- ⚠️ CRITICAL: After running this migration, you MUST reload the PostgREST schema cache!
-- See SUPABASE_SCHEMA_CACHE_REFRESH.md for instructions

-- Add victory_condition column to games table
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS victory_condition INTEGER DEFAULT 80;

-- Add check constraint to ensure reasonable victory thresholds (30-100%)
-- Wrapped in DO block to prevent errors if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.conname = 'victory_condition_check'
    AND t.relname = 'games'
    AND n.nspname = 'public'
  ) THEN
    ALTER TABLE games 
    ADD CONSTRAINT victory_condition_check 
    CHECK (victory_condition >= 30 AND victory_condition <= 100);
  END IF;
END $$;

-- Update existing games to have default victory_condition if NULL
UPDATE games 
SET victory_condition = 80 
WHERE victory_condition IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN games.victory_condition IS 'Territory percentage required to win the game (default: 80%). Player wins when they control this percentage of total territory.';
