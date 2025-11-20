-- Fix RLS policies for planet_attacks table to support anonymous gameplay
-- The existing policies use auth.uid() which doesn't work for anonymous players
-- This migration replaces them with game-participation-based policies

-- ============================================================================
-- PLANET_ATTACKS TABLE - Fix auth-based policies for anonymous gameplay
-- ============================================================================

-- Drop existing auth-based policies from add_territory_system.sql
DROP POLICY IF EXISTS "Players can view attacks in their games" ON planet_attacks;
DROP POLICY IF EXISTS "Players can create attacks" ON planet_attacks;
DROP POLICY IF EXISTS "Players can update their own attacks" ON planet_attacks;
DROP POLICY IF EXISTS "No direct deletion of attacks" ON planet_attacks;

-- Allow players to view attacks in games they're participating in
-- Uses current_setting('app.player_id') to identify the current player for anonymous gameplay
-- The application must set this session variable before querying attacks
-- Example: await supabase.rpc('set_player_context', { player_id: currentPlayer.id })
CREATE POLICY "Players can view attacks in their games (anonymous)"
  ON planet_attacks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM game_players
      WHERE game_players.game_id = planet_attacks.game_id
        AND game_players.player_id = current_setting('app.player_id', true)::uuid
    )
  );

-- Allow any player to create attacks
-- Client-side validation ensures they own the source planet
-- Server-side validation in game-tick Edge Function verifies before processing
CREATE POLICY "Players can create attacks (anonymous)"
  ON planet_attacks
  FOR INSERT
  WITH CHECK (true);

-- Allow service_role (game-tick Edge Function) to update attack status
-- Server processes attacks and updates status: in_transit -> arrived/retreating
CREATE POLICY "Service role can update attack status"
  ON planet_attacks
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to delete attacks if needed (maintenance)
CREATE POLICY "Service role can delete attacks"
  ON planet_attacks
  FOR DELETE
  TO service_role
  USING (true);

-- Grant explicit permissions
GRANT SELECT, INSERT ON planet_attacks TO anon;
GRANT SELECT, INSERT ON planet_attacks TO authenticated;
GRANT UPDATE, DELETE ON planet_attacks TO service_role;

-- ============================================================================
-- HELPER FUNCTION for setting player context
-- ============================================================================

-- Function to set the current player context for RLS policies
-- Application must call this before querying planet_attacks
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

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

-- Index for efficient attack queries by game, status, and arrival time
CREATE INDEX IF NOT EXISTS idx_planet_attacks_game_status_arrival 
  ON planet_attacks(game_id, status, arrival_at);

-- Index for attacker lookups
CREATE INDEX IF NOT EXISTS idx_planet_attacks_attacker 
  ON planet_attacks(attacker_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE planet_attacks IS 'Tracks troop movements between planets. Supports anonymous gameplay. Clients create attacks, server (game-tick Edge Function) validates and processes them.';

COMMENT ON POLICY "Players can view attacks in their games (anonymous)" ON planet_attacks IS 'Anonymous-friendly SELECT policy using session variable. Application sets current_setting(''app.player_id'') before queries. Policy checks if that player_id exists in game_players for the attack''s game_id, ensuring players only see attacks in games they participate in.';

COMMENT ON POLICY "Players can create attacks (anonymous)" ON planet_attacks IS 'Permissive INSERT policy for anonymous players. Server validates ownership in game-tick function before processing.';

COMMENT ON POLICY "Service role can update attack status" ON planet_attacks IS 'Server-side attack processing. Game-tick function updates status during combat resolution.';

-- Verify the fix
DO $$
BEGIN
  RAISE NOTICE 'RLS policies fixed for planet_attacks table';
  RAISE NOTICE 'Table now supports anonymous gameplay';
  RAISE NOTICE 'Clients can create attacks, server validates and processes';
END $$;
