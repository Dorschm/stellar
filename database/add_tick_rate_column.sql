-- Migration: Add tick_rate column to games table
-- This stores the game tick interval in milliseconds (default: 100ms)
--
-- ⚠️ CRITICAL: After running this migration, you MUST reload the PostgREST schema cache!
-- See SUPABASE_SCHEMA_CACHE_REFRESH.md for instructions

-- Add tick_rate column to games table
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS tick_rate INTEGER DEFAULT 100;

-- Add check constraint to ensure reasonable tick rates (50-1000ms)
-- Wrapped in DO block to prevent errors if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.conname = 'tick_rate_check'
    AND t.relname = 'games'
    AND n.nspname = 'public'
  ) THEN
    ALTER TABLE games 
    ADD CONSTRAINT tick_rate_check 
    CHECK (tick_rate >= 50 AND tick_rate <= 1000);
  END IF;
END $$;

-- Update existing games to have default tick_rate if NULL
UPDATE games 
SET tick_rate = 100 
WHERE tick_rate IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN games.tick_rate IS 'Game tick interval in milliseconds. Controls how often the game state updates (default: 100ms = 10 ticks/second)';
