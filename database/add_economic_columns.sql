-- =====================================================
-- Migration: Add Economic Columns to Players and Gameplay Columns to Systems
-- =====================================================
-- Purpose: Fix schema mismatch causing 'credits column not found' error
-- Dependencies: Must run after FULL_DATABASE_SETUP.sql or base table creation
-- Post-migration: Requires schema cache reload in Supabase Dashboard
--
-- Related files:
-- - database/FULL_DATABASE_SETUP.sql (base schema)
-- - database/add_bot_players.sql (line 39: INSERT with credits, energy, minerals, research_points)
-- - src/services/gameService.ts (lines 248-252: INSERT with troop_count, energy_generation, etc.)
-- - src/services/GameEngine.ts (combat calculations using in_nebula)
-- - src/services/ResourceSystem.ts (resource formulas)
-- =====================================================

-- =====================================================
-- PART 1: Add Economic Resource Columns to Players Table
-- =====================================================

-- Add credits column for building structures and units
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 10000;

COMMENT ON COLUMN players.credits IS 'Gold/credits for purchasing structures. Generated at 10 per owned planet per tick.';

-- Add energy column for troop generation resource
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS energy INTEGER DEFAULT 50000;

COMMENT ON COLUMN players.energy IS 'Troop generation resource. Efficiency peaks at 42% capacity per OpenFront formula.';

-- Add minerals column for advanced structures
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS minerals INTEGER DEFAULT 1000;

COMMENT ON COLUMN players.minerals IS 'Resource mined from asteroid belts for advanced structures.';

-- Add research_points column (to be simplified in future migration)
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS research_points INTEGER DEFAULT 0;

COMMENT ON COLUMN players.research_points IS 'Tech progression points (to be simplified in future migration).';

-- Backfill existing NULL values with defaults (preserves non-NULL values)
UPDATE players 
SET 
  credits = COALESCE(credits, 10000),
  energy = COALESCE(energy, 50000),
  minerals = COALESCE(minerals, 1000),
  research_points = COALESCE(research_points, 0)
WHERE credits IS NULL OR energy IS NULL OR minerals IS NULL OR research_points IS NULL;

-- =====================================================
-- PART 2: Rename troops to troop_count and Add Gameplay Columns to Systems Table
-- =====================================================

-- Add troop_count column (initially NULL to allow data migration)
ALTER TABLE systems 
ADD COLUMN IF NOT EXISTS troop_count INTEGER;

-- Copy data from troops to troop_count (only if troops column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'systems' 
    AND column_name = 'troops'
  ) THEN
    UPDATE systems 
    SET troop_count = troops 
    WHERE troop_count IS NULL;
  END IF;
END $$;

-- Set default value for troop_count
ALTER TABLE systems 
ALTER COLUMN troop_count SET DEFAULT 0;

-- Make troop_count NOT NULL (after backfilling)
ALTER TABLE systems 
ALTER COLUMN troop_count SET NOT NULL;

-- Drop old troops column
ALTER TABLE systems 
DROP COLUMN IF EXISTS troops;

COMMENT ON COLUMN systems.troop_count IS 'Current troops stationed on this planet. Grows via OpenFront formula: base = 10 + (troops^0.73)/4.';

-- Add energy_generation column
ALTER TABLE systems 
ADD COLUMN IF NOT EXISTS energy_generation INTEGER DEFAULT 100;

COMMENT ON COLUMN systems.energy_generation IS 'Energy produced per tick. Scales with planet radius (80 + radiusEarth * 12).';

-- Add has_minerals column
ALTER TABLE systems 
ADD COLUMN IF NOT EXISTS has_minerals BOOLEAN DEFAULT false;

COMMENT ON COLUMN systems.has_minerals IS 'Resource node flag. Planets with radiusEarth >= 1.5 or asteroid belts have minerals.';

-- Add in_nebula column
ALTER TABLE systems 
ADD COLUMN IF NOT EXISTS in_nebula BOOLEAN DEFAULT false;

COMMENT ON COLUMN systems.in_nebula IS 'Terrain flag. Grants +50% defense in combat per GameEngine.ts calculations.';

-- Backfill reasonable values for existing systems based on heuristics
-- Set has_minerals = true for asteroid terrain types
UPDATE systems 
SET has_minerals = true 
WHERE terrain_type = 'asteroid' AND has_minerals = false;

-- Set in_nebula = true for nebula terrain types
UPDATE systems 
SET in_nebula = true 
WHERE terrain_type = 'nebula' AND in_nebula = false;

-- =====================================================
-- PART 3: Create Performance Indexes
-- =====================================================

-- Index for economic queries (filtering/sorting by credits)
CREATE INDEX IF NOT EXISTS idx_players_credits ON players(credits);

-- Index for combat/attack queries (filtering by troop count)
CREATE INDEX IF NOT EXISTS idx_systems_troop_count ON systems(troop_count);

-- Composite index for resource/terrain lookups
CREATE INDEX IF NOT EXISTS idx_systems_resources ON systems(has_minerals, in_nebula);

-- =====================================================
-- VERIFICATION QUERIES (for manual testing after migration)
-- =====================================================

-- Uncomment and run these queries to verify the migration succeeded:

-- Check all columns exist:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name IN ('players', 'systems') 
-- AND column_name IN ('credits', 'energy', 'minerals', 'research_points', 'troop_count', 'energy_generation', 'has_minerals', 'in_nebula') 
-- ORDER BY table_name, column_name;

-- Verify data migration (should return row counts matching total players/systems):
-- SELECT COUNT(*) as players_with_credits FROM players WHERE credits IS NOT NULL;
-- SELECT COUNT(*) as systems_with_troops FROM systems WHERE troop_count IS NOT NULL;

-- Verify indexes were created:
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename IN ('players', 'systems') 
-- AND indexname IN ('idx_players_credits', 'idx_systems_troop_count', 'idx_systems_resources');

-- =====================================================
-- POST-MIGRATION STEPS
-- =====================================================
-- 1. Reload schema cache: Dashboard → Settings → API → Reload Schema
-- 2. Test bot creation: Start a new game with bots
-- 3. Verify no "column not found" errors in console
-- 4. Confirm systems have troop_count values (not NULL)
-- =====================================================
