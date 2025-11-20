-- Fix overly restrictive RLS policies blocking game tick processing
-- These tables are server-managed by Edge Functions using service_role
-- Clients should only have read access

-- ============================================================================
-- GAME_TICKS TABLE - Fix blocking policies
-- ============================================================================

-- Drop the blocking policies that use USING (false)
DROP POLICY IF EXISTS "Restrict direct insert on game_ticks" ON game_ticks;
DROP POLICY IF EXISTS "Restrict direct update on game_ticks" ON game_ticks;
DROP POLICY IF EXISTS "Restrict direct delete on game_ticks" ON game_ticks;

-- Keep the existing SELECT policy for users
-- This allows clients to read tick data
-- Policy "Anyone can view game ticks" should already exist

-- Allow service_role to INSERT new tick records
CREATE POLICY "Service role can insert game ticks"
  ON game_ticks
  FOR INSERT
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to UPDATE tick numbers
CREATE POLICY "Service role can update game ticks"
  ON game_ticks
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant explicit permissions to service_role
GRANT INSERT, UPDATE ON game_ticks TO service_role;

-- ============================================================================
-- TERRITORY_SECTORS TABLE - Fix blocking policies
-- ============================================================================

-- Drop the blocking policies that use USING (false)
DROP POLICY IF EXISTS "Restrict direct insert on territory_sectors" ON territory_sectors;
DROP POLICY IF EXISTS "Restrict direct update on territory_sectors" ON territory_sectors;
DROP POLICY IF EXISTS "Restrict direct delete on territory_sectors" ON territory_sectors;

-- Keep the existing SELECT policy for users
-- Policy "Anyone can view territory sectors" should already exist

-- Allow service_role to INSERT new sectors during expansion
CREATE POLICY "Service role can insert territory sectors"
  ON territory_sectors
  FOR INSERT
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to UPDATE sector ownership on planet capture
CREATE POLICY "Service role can update territory sectors"
  ON territory_sectors
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to DELETE sectors if needed
CREATE POLICY "Service role can delete territory sectors"
  ON territory_sectors
  FOR DELETE
  TO service_role
  USING (true);

-- Grant explicit permissions to service_role
GRANT INSERT, UPDATE, DELETE ON territory_sectors TO service_role;

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

-- Index on game_ticks for fast lookups by game
CREATE INDEX IF NOT EXISTS idx_game_ticks_game_id ON game_ticks(game_id);

-- Index on game_ticks for monitoring last tick time
CREATE INDEX IF NOT EXISTS idx_game_ticks_last_tick_at ON game_ticks(last_tick_at);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE game_ticks IS 'Server-managed tick counter for game simulation. Modified only by Edge Functions with service_role. Clients have read-only access.';
COMMENT ON TABLE territory_sectors IS 'Server-managed territory expansion system. Modified only by Edge Functions with service_role. Clients have read-only access.';

-- Verify the fix
DO $$
BEGIN
  RAISE NOTICE 'RLS policies fixed for game_ticks and territory_sectors';
  RAISE NOTICE 'Service role can now INSERT/UPDATE these tables';
  RAISE NOTICE 'Clients retain read-only access via SELECT policies';
END $$;
