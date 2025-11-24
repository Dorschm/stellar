-- Migration: Add difficulty column to games table
-- This allows storing bot difficulty setting when games are created
--
-- ⚠️ CRITICAL: After running this migration, you MUST reload the PostgREST schema cache!
-- See SUPABASE_SCHEMA_CACHE_REFRESH.md for instructions
--
-- HOW TO RUN THIS MIGRATION:
-- 1. Navigate to Supabase Dashboard → SQL Editor
-- 2. Copy the entire contents of this file
-- 3. Paste into a new query
-- 4. Click **Run** button
-- 5. Verify success messages:
--    - `ALTER TABLE` (adds difficulty column)
--    - `ALTER TABLE` (adds check constraint)
--    - `UPDATE` (sets default values for existing games)
--
-- VERIFICATION QUERY (run after migration):
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'games' AND column_name = 'difficulty';
-- 
-- Expected result: 1 row showing `difficulty | text | 'normal'::text`
--
-- NOTE: The `IF NOT EXISTS` clause makes it safe to re-run. If you see 
-- "column already exists" errors, the migration was already applied—
-- proceed to schema cache reload.

-- Add difficulty column to games table
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'normal';

-- Add check constraint to ensure only valid difficulty values
ALTER TABLE games 
ADD CONSTRAINT difficulty_check 
CHECK (difficulty IN ('easy', 'normal', 'hard'));

-- Update existing games to have 'normal' difficulty if NULL
UPDATE games 
SET difficulty = 'normal' 
WHERE difficulty IS NULL;
