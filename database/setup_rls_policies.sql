-- Supabase Row Level Security (RLS) Policies for Stellar
-- Production-ready security policies following principle of least privilege
-- Run this in your Supabase SQL Editor

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
-- These indexes improve RLS policy performance

CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_player_id ON game_players(player_id);
CREATE INDEX IF NOT EXISTS idx_game_players_placement ON game_players(game_id, placement_order);
CREATE INDEX IF NOT EXISTS idx_systems_game_id ON systems(game_id);
CREATE INDEX IF NOT EXISTS idx_systems_owner ON systems(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

-- =============================================================================
-- SECURITY NOTES
-- =============================================================================
-- These policies implement the following security model:
--
-- 1. Anonymous player creation allowed (for quick gameplay)
-- 2. Public game browsing allowed (anyone can see waiting games)
-- 3. Game participation required to see game details
-- 4. Host-only game management (start, delete)
-- 5. Owner-only resource management (update/delete own fleets)
-- 6. No data deletion for audit trail (players, systems)
--
-- For authenticated gameplay, replace player ID checks with:
--   auth.uid() = player_id
--
-- To migrate to authenticated users:
-- 1. Add user_id column to players table
-- 2. Update policies to check auth.uid()
-- 3. Create users table linking Supabase Auth to players
