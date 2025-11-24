-- Fix CORS and RLS Policies for Anonymous Gameplay
-- =====================================================
-- This migration addresses auth-based policies that block anonymous players
-- from accessing game data. It follows the patterns established in
-- fix_game_tick_rls_policies.sql and fix_planet_attacks_rls.sql
--
-- Run this migration after:
-- - setup_rls_policies.sql (which configures game_players RLS)
-- - add_economic_system.sql (which creates structures table with auth-based policies)
--
-- This fixes the fundamental mismatch between auth-based security policies
-- and the anonymous gameplay model where players are identified by UUID
-- in game_players, not by auth.uid()
--
-- Note: This script only VERIFIES game_players policies (which are already
-- anonymous-friendly from setup_rls_policies.sql). It FIXES structures policies.

-- =========================================
-- 1. FIX STRUCTURES TABLE SCHEMA
-- =========================================
-- Add missing columns to structures table if they don't exist

-- Add game_id column (CRITICAL - required by RLS policies)
ALTER TABLE structures 
ADD COLUMN IF NOT EXISTS game_id UUID;

-- Add is_active column
ALTER TABLE structures 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add created_at column
ALTER TABLE structures 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Populate game_id from systems table for existing records
UPDATE structures s
SET game_id = sys.game_id
FROM systems sys
WHERE s.system_id = sys.id
AND s.game_id IS NULL;

-- Make game_id NOT NULL if not already
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'structures' 
        AND column_name = 'game_id' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE structures ALTER COLUMN game_id SET NOT NULL;
    END IF;
END $$;

-- Add foreign key constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'structures_game_id_fkey'
    ) THEN
        ALTER TABLE structures
        ADD CONSTRAINT structures_game_id_fkey 
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
    END IF;
END $$;

-- =========================================
-- 2. FIX STRUCTURES TABLE POLICIES
-- =========================================
-- The structures table currently uses auth.uid() checks from add_economic_system.sql
-- which don't work with anonymous players. Replace with game_players subqueries.

-- Drop all existing policies on structures
DROP POLICY IF EXISTS "structures_all_policy" ON structures;
DROP POLICY IF EXISTS "Players can view structures in their game" ON structures;
DROP POLICY IF EXISTS "Players can create structures on their planets" ON structures;
DROP POLICY IF EXISTS "Players can insert their own structures" ON structures;
DROP POLICY IF EXISTS "Players can update their own structures" ON structures;
DROP POLICY IF EXISTS "Players can delete their own structures" ON structures;

-- Create anonymous-friendly SELECT policy
-- Players can view all structures in games they're participating in
-- Uses current_setting('app.player_id') to identify the current player
-- The application must call set_player_context before querying structures
CREATE POLICY "structures_select_policy" ON structures
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = structures.game_id
        AND game_players.player_id = current_setting('app.player_id', true)::uuid
    )
);

-- Create INSERT policy
-- Players can create structures only if they are the owner and in the game
-- Verifies current player matches owner_id and is in the game
CREATE POLICY "structures_insert_policy" ON structures
FOR INSERT
WITH CHECK (
    structures.owner_id = current_setting('app.player_id', true)::uuid
    AND EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = structures.game_id
        AND game_players.player_id = current_setting('app.player_id', true)::uuid
    )
);

-- Create UPDATE policy
-- Players can only update structures they own
-- Verifies current player is the owner
CREATE POLICY "structures_update_policy" ON structures
FOR UPDATE
USING (
    structures.owner_id = current_setting('app.player_id', true)::uuid
)
WITH CHECK (
    structures.owner_id = current_setting('app.player_id', true)::uuid
);

-- Create DELETE policy
-- Players can only delete structures they own
-- Verifies current player is the owner
CREATE POLICY "structures_delete_policy" ON structures
FOR DELETE
USING (
    structures.owner_id = current_setting('app.player_id', true)::uuid
);

-- Grant service_role explicit permissions for server-side operations
GRANT ALL ON structures TO service_role;

-- Grant permissions to anonymous and authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON structures TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON structures TO authenticated;

-- =========================================
-- 3. HELPER FUNCTION for setting player context
-- =========================================

-- Function to set the current player context for RLS policies
-- Application must call this before querying structures
-- Example: await supabase.rpc('set_player_context', { player_id: currentPlayer.id })
CREATE OR REPLACE FUNCTION set_player_context(player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.player_id', player_id::text, false);
END;
$$;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION set_player_context(uuid) TO anon;
GRANT EXECUTE ON FUNCTION set_player_context(uuid) TO authenticated;

-- =========================================
-- 4. VERIFY GAME_PLAYERS POLICIES
-- =========================================
-- The game_players table policies are already configured by setup_rls_policies.sql
-- and support anonymous gameplay patterns. This section only verifies their presence.
--
-- Expected policies from setup_rls_policies.sql:
-- - game_players_insert_policy: Players can join waiting games (no auth.uid() checks)
-- - game_players_select_policy: Anyone can read (USING (true))
-- - game_players_update_policy: Participants can update their own entry (USING (true))
-- - game_players_delete_policy: Players can leave waiting games (no auth.uid() checks)
--
-- These policies are anonymous-friendly and do not need to be recreated.
-- The verification query at the end of this script confirms they are in place.

-- =========================================
-- 5. ADD PERFORMANCE INDEXES
-- =========================================
-- Create indexes to optimize RLS policy subqueries

-- Indexes for structures table
CREATE INDEX IF NOT EXISTS idx_structures_game_id 
ON structures(game_id);

-- Note: idx_structures_game_owner on (game_id, owner_id) is already created by add_economic_system.sql
-- No need to recreate it here to avoid index bloat

CREATE INDEX IF NOT EXISTS idx_structures_system_id 
ON structures(system_id);

CREATE INDEX IF NOT EXISTS idx_structures_owner_id 
ON structures(owner_id);

CREATE INDEX IF NOT EXISTS idx_structures_active 
ON structures(is_active) WHERE is_active = TRUE;

-- Index for game_players lookups
CREATE INDEX IF NOT EXISTS idx_game_players_lookup 
ON game_players(game_id, player_id);

-- =========================================
-- 6. VERIFICATION QUERIES
-- =========================================
-- List all policies on affected tables to confirm changes

-- Show structures table policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'structures'
ORDER BY policyname;

-- Show game_players table policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'game_players'
ORDER BY policyname;

-- Test query to verify anonymous access to structures
-- This should work without authentication after migration
SELECT COUNT(*) as structure_count
FROM structures
WHERE game_id IS NOT NULL
LIMIT 1;

-- =========================================
-- 7. COMMENTS
-- =========================================

COMMENT ON TABLE structures IS 'Economic structures built in star systems. Supports anonymous gameplay. Clients must call set_player_context before queries.';

COMMENT ON POLICY "structures_select_policy" ON structures IS 'Anonymous-friendly SELECT policy using session variable. Application sets current_setting(''app.player_id'') before queries. Policy checks if that player_id exists in game_players for the structure''s game_id.';

COMMENT ON POLICY "structures_insert_policy" ON structures IS 'Owner-only INSERT policy. Verifies current player context matches owner_id and player is in the game.';

COMMENT ON POLICY "structures_update_policy" ON structures IS 'Owner-only UPDATE policy. Verifies current player context matches owner_id.';

COMMENT ON POLICY "structures_delete_policy" ON structures IS 'Owner-only DELETE policy. Verifies current player context matches owner_id.';

-- =========================================
-- 8. DOCUMENTATION
-- =========================================
-- Anonymous Gameplay Pattern:
-- - Players are identified by UUID stored in the players table
-- - No Supabase Auth (auth.uid()) is required or used
-- - game_players links players to games via player_id (not auth.uid())
-- - All RLS policies check game participation via game_players subqueries
-- - Service role is used for server-side operations (Edge Functions)
--
-- This migration completes the transition from auth-based to anonymous gameplay
-- by fixing the remaining tables that still had auth.uid() checks.
--
-- After this migration:
-- - Client can read/write structures without authentication
-- - Edge Functions can process game ticks with service_role
-- - All tables support anonymous player participation
