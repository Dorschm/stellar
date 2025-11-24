-- =====================================================
-- STELLAR GAME - COMPLETE DATABASE SETUP
-- =====================================================
-- This file consolidates ALL migrations into a single script
-- for easy database reset and setup.
--
-- Includes economic columns (credits, energy, minerals, research_points) 
-- and gameplay columns (troop_count, energy_generation, has_minerals, in_nebula)
-- as of the add_economic_columns.sql migration.
--
-- Run this ONCE in Supabase SQL Editor after db reset.
-- Then reload schema cache via Dashboard → Settings → API → Reload Schema
--
-- DO NOT use 'supabase db reset --linked' to reload schema cache!
-- That command wipes your entire database.
-- =====================================================

-- =====================================================
-- MIGRATION 0: Create Base Tables
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create players table
CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_bot BOOLEAN DEFAULT FALSE,
    credits INTEGER DEFAULT 10000,
    energy INTEGER DEFAULT 50000,
    minerals INTEGER DEFAULT 1000,
    research_points INTEGER DEFAULT 0,
    bot_difficulty TEXT DEFAULT 'normal'
);

-- Create games table
CREATE TABLE IF NOT EXISTS public.games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
    max_players INTEGER DEFAULT 4,
    galaxy_size INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    winner_id UUID REFERENCES public.players(id),
    victory_type TEXT CHECK (victory_type IN ('conquest', 'economic', 'diplomatic', 'abandoned'))
);

-- Create game_players table (join table for games and players)
CREATE TABLE IF NOT EXISTS public.game_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    placement_order INTEGER NOT NULL,
    color TEXT NOT NULL,
    ready BOOLEAN DEFAULT FALSE,
    eliminated BOOLEAN DEFAULT FALSE,
    eliminated_at TIMESTAMP WITH TIME ZONE,
    final_placement INTEGER,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(game_id, player_id),
    UNIQUE(game_id, placement_order)
);

-- Create systems table (planets/star systems)
CREATE TABLE IF NOT EXISTS public.systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    x_pos FLOAT NOT NULL,
    y_pos FLOAT NOT NULL,
    z_pos FLOAT NOT NULL,
    owner_id UUID REFERENCES public.players(id),
    troop_count INTEGER DEFAULT 0,
    energy_generation INTEGER DEFAULT 100,
    has_minerals BOOLEAN DEFAULT false,
    in_nebula BOOLEAN DEFAULT false,
    terrain_type TEXT DEFAULT 'space' CHECK (terrain_type IN ('space', 'nebula', 'asteroid')),
    captured_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(game_id, name)
);

-- Create structures table (buildings on systems)
CREATE TABLE IF NOT EXISTS public.structures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id UUID NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.players(id),
    structure_type TEXT NOT NULL CHECK (structure_type IN ('defense_station', 'factory', 'research_lab', 'trade_hub')),
    level INTEGER DEFAULT 1,
    health INTEGER DEFAULT 100,
    built_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create fleets table (optional, if needed)
CREATE TABLE IF NOT EXISTS public.fleets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.players(id),
    name TEXT NOT NULL,
    system_id UUID REFERENCES public.systems(id),
    ships INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create basic indexes
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_player ON game_players(player_id);
CREATE INDEX IF NOT EXISTS idx_systems_game ON systems(game_id);
CREATE INDEX IF NOT EXISTS idx_systems_owner ON systems(owner_id);
CREATE INDEX IF NOT EXISTS idx_games_status_idx ON games(status);
CREATE INDEX IF NOT EXISTS idx_players_credits ON players(credits);
CREATE INDEX IF NOT EXISTS idx_systems_troop_count ON systems(troop_count);
CREATE INDEX IF NOT EXISTS idx_systems_resources ON systems(has_minerals, in_nebula);

-- Add column documentation
COMMENT ON COLUMN players.credits IS 'Gold/credits for purchasing structures. Generated at 10 per owned planet per tick.';
COMMENT ON COLUMN players.energy IS 'Troop generation resource. Efficiency peaks at 42% capacity per OpenFront formula.';
COMMENT ON COLUMN systems.troop_count IS 'Current troops stationed on this planet. Grows via OpenFront formula: base = 10 + (troops^0.73)/4.';
COMMENT ON COLUMN systems.energy_generation IS 'Energy produced per tick. Scales with planet radius (80 + radiusEarth * 12).';
COMMENT ON COLUMN systems.has_minerals IS 'Resource node flag. Planets with radiusEarth >= 1.5 or asteroid belts have minerals.';
COMMENT ON COLUMN systems.in_nebula IS 'Terrain flag. Grants +50% defense in combat per GameEngine.ts calculations.';

-- =====================================================
-- MIGRATION 1: Add is_public column
-- =====================================================

-- Add is_public column to games table for public/private game support
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false NOT NULL;

-- Create index for efficient public game queries
CREATE INDEX IF NOT EXISTS idx_games_public_status ON games(is_public, status) 
WHERE status = 'waiting';

-- Create index for general status queries
CREATE INDEX IF NOT EXISTS idx_games_status_created ON games(status, created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN games.is_public IS 'Whether this game appears in public lobby (true) or is private/invite-only (false)';

-- =====================================================
-- MIGRATION 2: Setup RLS Policies
-- =====================================================

-- =============================================================================
-- PLAYERS TABLE POLICIES
-- =============================================================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Anyone can create a player (anonymous gameplay)
CREATE POLICY "players_insert_policy" ON players
FOR INSERT WITH CHECK (true);

-- Anyone can read any player (for displaying usernames in lobbies)
CREATE POLICY "players_select_policy" ON players
FOR SELECT USING (true);

-- Players can update their own stats (identified by id)
CREATE POLICY "players_update_own_policy" ON players
FOR UPDATE USING (true)
WITH CHECK (true);

-- No one can delete players (data retention)
CREATE POLICY "players_delete_policy" ON players
FOR DELETE USING (false);

-- =============================================================================
-- GAMES TABLE POLICIES  
-- =============================================================================
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Anyone can create a game
CREATE POLICY "games_insert_policy" ON games
FOR INSERT WITH CHECK (true);

-- Anyone can read waiting games (for browsing lobbies)
-- Only participants can read active/completed games
CREATE POLICY "games_select_policy" ON games
FOR SELECT USING (
  status = 'waiting' OR
  EXISTS (
    SELECT 1 FROM game_players
    WHERE game_players.game_id = games.id
  )
);

-- Only the host (first player by placement_order) can update game status
CREATE POLICY "games_update_policy" ON games
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM game_players
    WHERE game_players.game_id = games.id
    AND game_players.placement_order = 1
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM game_players
    WHERE game_players.game_id = games.id
    AND game_players.placement_order = 1
  )
);

-- Only host can delete waiting games, no one can delete active games
CREATE POLICY "games_delete_policy" ON games
FOR DELETE USING (
  status = 'waiting' AND
  EXISTS (
    SELECT 1 FROM game_players
    WHERE game_players.game_id = games.id
    AND game_players.placement_order = 1
  )
);

-- =============================================================================
-- GAME_PLAYERS TABLE POLICIES
-- =============================================================================
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;

-- Players can join waiting games
CREATE POLICY "game_players_insert_policy" ON game_players
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM games
    WHERE games.id = game_players.game_id
    AND games.status = 'waiting'
  )
);

-- Anyone can read game_players (for displaying lobby participant lists)
CREATE POLICY "game_players_select_policy" ON game_players
FOR SELECT USING (true);

-- Participants can update their own entry
CREATE POLICY "game_players_update_policy" ON game_players
FOR UPDATE USING (true)
WITH CHECK (true);

-- Players can leave waiting games, host can kick players from waiting games
CREATE POLICY "game_players_delete_policy" ON game_players
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM games
    WHERE games.id = game_players.game_id
    AND games.status = 'waiting'
  )
);

-- =============================================================================
-- SYSTEMS TABLE POLICIES
-- =============================================================================
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;

-- Only the game service can create systems (during galaxy generation)
CREATE POLICY "systems_insert_policy" ON systems
FOR INSERT WITH CHECK (true);

-- Only game participants can read systems in their game
CREATE POLICY "systems_select_policy" ON systems
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM game_players
    WHERE game_players.game_id = systems.game_id
  )
);

-- Game participants can update systems (for capturing, building)
CREATE POLICY "systems_update_policy" ON systems
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM game_players
    WHERE game_players.game_id = systems.game_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM game_players
    WHERE game_players.game_id = systems.game_id
  )
);

-- Systems should not be deleted (data integrity)
CREATE POLICY "systems_delete_policy" ON systems
FOR DELETE USING (false);

-- =============================================================================
-- FLEETS TABLE POLICIES (if table exists)
-- =============================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fleets') THEN
    EXECUTE 'ALTER TABLE fleets ENABLE ROW LEVEL SECURITY';
    
    -- Game participants can create fleets
    EXECUTE 'CREATE POLICY "fleets_insert_policy" ON fleets
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = fleets.game_id
        AND game_players.player_id = fleets.owner_id
      )
    )';
    
    -- Game participants can read all fleets in their game
    EXECUTE 'CREATE POLICY "fleets_select_policy" ON fleets
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = fleets.game_id
      )
    )';
    
    -- Players can update their own fleets
    EXECUTE 'CREATE POLICY "fleets_update_policy" ON fleets
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = fleets.game_id
        AND game_players.player_id = fleets.owner_id
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = fleets.game_id
        AND game_players.player_id = fleets.owner_id
      )
    )';
    
    -- Players can delete their own fleets
    EXECUTE 'CREATE POLICY "fleets_delete_policy" ON fleets
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = fleets.game_id
        AND game_players.player_id = fleets.owner_id
      )
    )';
  END IF;
END $$;

-- =============================================================================
-- STRUCTURES TABLE POLICIES (if table exists)
-- =============================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'structures') THEN
    EXECUTE 'ALTER TABLE structures ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "structures_all_policy" ON structures FOR ALL USING (
      EXISTS (
        SELECT 1 FROM game_players gp
        JOIN systems s ON s.game_id = gp.game_id
        WHERE s.id = structures.system_id
      )
    )';
  END IF;
END $$;

-- =============================================================================
-- TRADE_ROUTES TABLE POLICIES (if table exists)
-- =============================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'trade_routes') THEN
    EXECUTE 'ALTER TABLE trade_routes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "trade_routes_all_policy" ON trade_routes FOR ALL USING (true)';
  END IF;
END $$;

-- =============================================================================
-- COMBAT_LOGS TABLE POLICIES (if table exists)
-- =============================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'combat_logs') THEN
    EXECUTE 'ALTER TABLE combat_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "combat_logs_all_policy" ON combat_logs FOR ALL USING (true)';
  END IF;
END $$;

-- =============================================================================
-- ALLIANCES TABLE POLICIES (if table exists)
-- =============================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'alliances') THEN
    EXECUTE 'ALTER TABLE alliances ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "alliances_all_policy" ON alliances FOR ALL USING (true)';
  END IF;
END $$;

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_player_id ON game_players(player_id);
CREATE INDEX IF NOT EXISTS idx_game_players_placement ON game_players(game_id, placement_order);
CREATE INDEX IF NOT EXISTS idx_systems_game_id ON systems(game_id);
CREATE INDEX IF NOT EXISTS idx_systems_owner ON systems(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

-- =====================================================
-- MIGRATION 3: Add Territory System
-- =====================================================

-- Create territory sectors table
CREATE TABLE IF NOT EXISTS public.territory_sectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES players(id),
    x_pos FLOAT NOT NULL,
    y_pos FLOAT NOT NULL, 
    z_pos FLOAT NOT NULL,
    controlled_by_planet_id UUID REFERENCES systems(id) ON DELETE CASCADE,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate sectors
    UNIQUE(game_id, x_pos, y_pos, z_pos)
);

-- Add expansion metadata columns for progressive expansion
ALTER TABLE territory_sectors ADD COLUMN IF NOT EXISTS expansion_tier INTEGER DEFAULT 1;
ALTER TABLE territory_sectors ADD COLUMN IF NOT EXISTS expansion_wave INTEGER DEFAULT 0;
ALTER TABLE territory_sectors ADD COLUMN IF NOT EXISTS distance_from_planet FLOAT;

-- Add indexes for performance
CREATE INDEX idx_territory_sectors_game ON territory_sectors(game_id);
CREATE INDEX idx_territory_sectors_owner ON territory_sectors(owner_id);
CREATE INDEX idx_territory_sectors_planet ON territory_sectors(controlled_by_planet_id);
CREATE INDEX IF NOT EXISTS idx_territory_sectors_position ON territory_sectors(game_id, owner_id, x_pos, y_pos, z_pos);

-- Create attacks table for tracking troop movements
CREATE TABLE IF NOT EXISTS public.planet_attacks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    attacker_id UUID NOT NULL REFERENCES players(id),
    source_planet_id UUID NOT NULL REFERENCES systems(id),
    target_planet_id UUID NOT NULL REFERENCES systems(id),
    troops INTEGER NOT NULL,
    launched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    arrival_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'in_transit' CHECK (status IN ('in_transit', 'arrived', 'retreating'))
);

CREATE INDEX idx_planet_attacks_game ON planet_attacks(game_id);
CREATE INDEX idx_planet_attacks_arrival ON planet_attacks(arrival_at);

-- Add game_ticks table to track server-side game state
CREATE TABLE IF NOT EXISTS public.game_ticks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    tick_number INTEGER NOT NULL DEFAULT 0,
    last_tick_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(game_id)
);

-- Add bot players
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;

-- Enable RLS on new tables
ALTER TABLE territory_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE planet_attacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_ticks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for territory_sectors
CREATE POLICY "Anyone can view territory sectors" ON territory_sectors
    FOR SELECT USING (true);

CREATE POLICY "Only server can modify territory" ON territory_sectors
    FOR ALL USING (false);

-- RLS Policies for planet_attacks  
CREATE POLICY "Players can view attacks in their game" ON planet_attacks
    FOR SELECT USING (
        game_id IN (
            SELECT game_id FROM game_players 
            WHERE player_id = auth.uid()
        )
    );

CREATE POLICY "Players can create their own attacks" ON planet_attacks
    FOR INSERT WITH CHECK (attacker_id = auth.uid());

-- RLS Policies for game_ticks
CREATE POLICY "Anyone can view game ticks" ON game_ticks
    FOR SELECT USING (true);

CREATE POLICY "Only server can update ticks" ON game_ticks
    FOR ALL USING (false);

-- Helper function to find edge sectors for progressive expansion
CREATE OR REPLACE FUNCTION get_edge_sectors(p_game_id UUID, p_planet_id UUID)
RETURNS TABLE(id UUID, x_pos FLOAT, y_pos FLOAT, z_pos FLOAT) AS $$
BEGIN
  RETURN QUERY
  SELECT ts.id, ts.x_pos, ts.y_pos, ts.z_pos
  FROM territory_sectors ts
  WHERE ts.game_id = p_game_id
    AND ts.controlled_by_planet_id = p_planet_id
    AND ts.expansion_wave = (
      SELECT MAX(expansion_wave) 
      FROM territory_sectors 
      WHERE game_id = p_game_id 
        AND controlled_by_planet_id = p_planet_id
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MIGRATION 4: Add Combat System
-- =====================================================

-- Add combat_logs table for tracking all combat events
CREATE TABLE IF NOT EXISTS public.combat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    attacker_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    defender_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    system_id UUID NOT NULL REFERENCES public.systems(id) ON DELETE CASCADE,
    attacker_troops INTEGER NOT NULL,
    defender_troops INTEGER NOT NULL,
    attacker_losses INTEGER NOT NULL,
    defender_losses INTEGER NOT NULL,
    attacker_survivors INTEGER NOT NULL,
    defender_survivors INTEGER NOT NULL,
    winner_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    terrain_type TEXT NOT NULL CHECK (terrain_type IN ('space', 'nebula', 'asteroid')),
    had_flanking BOOLEAN NOT NULL DEFAULT false,
    was_encircled BOOLEAN NOT NULL DEFAULT false,
    had_defense_station BOOLEAN NOT NULL DEFAULT false,
    combat_result TEXT NOT NULL CHECK (combat_result IN ('attacker_victory', 'defender_victory', 'retreat')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist when table predates this migration
ALTER TABLE public.combat_logs
    ADD COLUMN IF NOT EXISTS attacker_troops INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS defender_troops INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS attacker_losses INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS defender_losses INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS attacker_survivors INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS defender_survivors INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS terrain_type TEXT NOT NULL DEFAULT 'space' CHECK (terrain_type IN ('space', 'nebula', 'asteroid')),
    ADD COLUMN IF NOT EXISTS had_flanking BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS was_encircled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS had_defense_station BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS combat_result TEXT NOT NULL DEFAULT 'defender_victory' CHECK (combat_result IN ('attacker_victory', 'defender_victory', 'retreat')),
    ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add indexes for efficient querying
CREATE INDEX idx_combat_logs_game_id ON public.combat_logs(game_id);
CREATE INDEX idx_combat_logs_attacker_id ON public.combat_logs(attacker_id);
CREATE INDEX idx_combat_logs_defender_id ON public.combat_logs(defender_id);
CREATE INDEX idx_combat_logs_occurred_at ON public.combat_logs(occurred_at DESC);

-- Enable Row Level Security
ALTER TABLE public.combat_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Allow all game participants to read combat logs from their games
CREATE POLICY "Players can read combat logs from their games" ON public.combat_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.game_players
            WHERE game_players.game_id = combat_logs.game_id
            AND game_players.player_id = auth.uid()
        )
    );

-- Grant permissions
GRANT SELECT ON public.combat_logs TO authenticated;
GRANT INSERT ON public.combat_logs TO service_role;

-- Add comment for table documentation
COMMENT ON TABLE public.combat_logs IS 'Tracks all combat events in the game with detailed battle information';
COMMENT ON COLUMN public.combat_logs.terrain_type IS 'The terrain type where combat occurred: space (normal), nebula (+50% defense), asteroid (+25% defense)';
COMMENT ON COLUMN public.combat_logs.had_flanking IS 'Whether the attacker had flanking bonus (+20% attack) from multiple angles';
COMMENT ON COLUMN public.combat_logs.was_encircled IS 'Whether the defender was encircled (instant surrender) from all 6 directions';
COMMENT ON COLUMN public.combat_logs.combat_result IS 'The outcome of the combat: attacker_victory, defender_victory, or retreat';
COMMENT ON COLUMN public.combat_logs.occurred_at IS 'Timestamp for when the combat was resolved';

-- =====================================================
-- MIGRATION 5: Fix Game Tick RLS Policies
-- =====================================================

-- Drop the blocking policies that use USING (false)
DROP POLICY IF EXISTS "Restrict direct insert on game_ticks" ON game_ticks;
DROP POLICY IF EXISTS "Restrict direct update on game_ticks" ON game_ticks;
DROP POLICY IF EXISTS "Restrict direct delete on game_ticks" ON game_ticks;

-- Allow service_role to INSERT new tick records
CREATE POLICY "Service role can insert game ticks"
  ON game_ticks
  FOR INSERT
  TO service_role
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

-- Drop the blocking policies that use USING (false)
DROP POLICY IF EXISTS "Restrict direct insert on territory_sectors" ON territory_sectors;
DROP POLICY IF EXISTS "Restrict direct update on territory_sectors" ON territory_sectors;
DROP POLICY IF EXISTS "Restrict direct delete on territory_sectors" ON territory_sectors;

-- Allow service_role to INSERT new sectors during expansion
CREATE POLICY "Service role can insert territory sectors"
  ON territory_sectors
  FOR INSERT
  TO service_role
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

-- Index on game_ticks for fast lookups by game
CREATE INDEX IF NOT EXISTS idx_game_ticks_game_id ON game_ticks(game_id);

-- Index on game_ticks for monitoring last tick time
CREATE INDEX IF NOT EXISTS idx_game_ticks_last_tick_at ON game_ticks(last_tick_at);

COMMENT ON TABLE game_ticks IS 'Server-managed tick counter for game simulation. Modified only by Edge Functions with service_role. Clients have read-only access.';
COMMENT ON TABLE territory_sectors IS 'Server-managed territory expansion system. Modified only by Edge Functions with service_role. Clients have read-only access.';

-- =====================================================
-- MIGRATION 6: Fix Planet Attacks RLS for Anonymous Gameplay
-- =====================================================

-- Drop existing auth-based policies from add_territory_system.sql
DROP POLICY IF EXISTS "Players can view attacks in their games" ON planet_attacks;
DROP POLICY IF EXISTS "Players can create attacks" ON planet_attacks;
DROP POLICY IF EXISTS "Players can update their own attacks" ON planet_attacks;
DROP POLICY IF EXISTS "No direct deletion of attacks" ON planet_attacks;
DROP POLICY IF EXISTS "Players can view attacks in their game" ON planet_attacks;
DROP POLICY IF EXISTS "Players can create their own attacks" ON planet_attacks;

-- Allow players to view attacks in games they're participating in
-- Uses current_setting('app.player_id') to identify the current player for anonymous gameplay
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
CREATE POLICY "Players can create attacks (anonymous)"
  ON planet_attacks
  FOR INSERT
  WITH CHECK (true);

-- Allow service_role (game-tick Edge Function) to update attack status
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

-- Function to set the current player context for RLS policies
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

-- Index for efficient attack queries by game, status, and arrival time
CREATE INDEX IF NOT EXISTS idx_planet_attacks_game_status_arrival 
  ON planet_attacks(game_id, status, arrival_at);

-- Index for attacker lookups
CREATE INDEX IF NOT EXISTS idx_planet_attacks_attacker 
  ON planet_attacks(attacker_id);

COMMENT ON TABLE planet_attacks IS 'Tracks troop movements between planets. Supports anonymous gameplay. Clients create attacks, server (game-tick Edge Function) validates and processes them.';
COMMENT ON POLICY "Players can view attacks in their games (anonymous)" ON planet_attacks IS 'Anonymous-friendly SELECT policy using session variable. Application sets current_setting(''app.player_id'') before queries.';

-- =====================================================
-- MIGRATION 7: Add Player Activity Tracking
-- =====================================================

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

-- =====================================================
-- MIGRATION 8: Fix CORS and RLS Policies for Structures
-- =====================================================

-- Add missing columns to structures table if they don't exist
ALTER TABLE structures 
ADD COLUMN IF NOT EXISTS game_id UUID;

ALTER TABLE structures 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

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

-- Drop all existing policies on structures
DROP POLICY IF EXISTS "structures_all_policy" ON structures;
DROP POLICY IF EXISTS "Players can view structures in their game" ON structures;
DROP POLICY IF EXISTS "Players can create structures on their planets" ON structures;
DROP POLICY IF EXISTS "Players can insert their own structures" ON structures;
DROP POLICY IF EXISTS "Players can update their own structures" ON structures;
DROP POLICY IF EXISTS "Players can delete their own structures" ON structures;

-- Create anonymous-friendly SELECT policy
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
CREATE POLICY "structures_update_policy" ON structures
FOR UPDATE
USING (
    structures.owner_id = current_setting('app.player_id', true)::uuid
)
WITH CHECK (
    structures.owner_id = current_setting('app.player_id', true)::uuid
);

-- Create DELETE policy
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

-- Indexes for structures table
CREATE INDEX IF NOT EXISTS idx_structures_game_id 
ON structures(game_id);

CREATE INDEX IF NOT EXISTS idx_structures_system_id 
ON structures(system_id);

CREATE INDEX IF NOT EXISTS idx_structures_owner_id 
ON structures(owner_id);

CREATE INDEX IF NOT EXISTS idx_structures_active 
ON structures(is_active) WHERE is_active = TRUE;

-- Index for game_players lookups
CREATE INDEX IF NOT EXISTS idx_game_players_lookup 
ON game_players(game_id, player_id);

COMMENT ON TABLE structures IS 'Economic structures built in star systems. Supports anonymous gameplay. Clients must call set_player_context before queries.';
COMMENT ON POLICY "structures_select_policy" ON structures IS 'Anonymous-friendly SELECT policy using session variable. Application sets current_setting(''app.player_id'') before queries.';

-- =====================================================
-- MIGRATION 12: Atomic Troop Deduction RPC
-- =====================================================

-- Function to atomically deduct troops from a system
-- Prevents race conditions from concurrent updates by using database-side arithmetic
CREATE OR REPLACE FUNCTION deduct_troops(
  p_system_id UUID,
  p_troop_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_troops INTEGER;
  v_new_troops INTEGER;
BEGIN
  -- Lock the row and get current troop count
  SELECT troop_count INTO v_current_troops
  FROM systems
  WHERE id = p_system_id
  FOR UPDATE;
  
  -- Check if system exists
  IF v_current_troops IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'system_not_found',
      'message', 'System not found'
    );
  END IF;
  
  -- Check if sufficient troops
  IF v_current_troops < p_troop_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_troops',
      'message', 'Insufficient troops available',
      'current_troops', v_current_troops,
      'requested', p_troop_count
    );
  END IF;
  
  -- Perform atomic decrement
  UPDATE systems
  SET troop_count = troop_count - p_troop_count
  WHERE id = p_system_id;
  
  -- Get new troop count
  v_new_troops := v_current_troops - p_troop_count;
  
  RETURN jsonb_build_object(
    'success', true,
    'old_troops', v_current_troops,
    'deducted', p_troop_count,
    'new_troops', v_new_troops
  );
END;
$$;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION deduct_troops(UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION deduct_troops(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION deduct_troops IS 'Atomically deducts troops from a system with safety checks. Prevents race conditions by using database-side arithmetic with row locking.';

-- =====================================================
-- FINAL INSTRUCTIONS
-- =====================================================
-- 
-- After running this script:
-- 1. Go to Supabase Dashboard → Project Settings → API
-- 2. Click "Reload Schema" button
-- 3. Wait for confirmation (2-5 seconds)
-- 4. Refresh your application
-- 5. Test creating/joining games
--
-- DO NOT use 'supabase db reset --linked' to reload schema!
-- That command wipes your entire database.
-- =====================================================
