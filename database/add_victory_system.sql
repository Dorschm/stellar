-- Migration: Add victory system and game completion support
-- Enables tracking of winners, eliminated players, and detailed game statistics

-- Alter games table to add victory tracking fields
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES players(id),
ADD COLUMN IF NOT EXISTS victory_type TEXT CHECK (victory_type IN ('territory_control', 'elimination', 'time_limit')),
ADD COLUMN IF NOT EXISTS game_duration_seconds INTEGER;

-- Alter game_players table to track elimination and final stats
ALTER TABLE game_players
ADD COLUMN IF NOT EXISTS is_eliminated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS eliminated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS final_territory_percentage FLOAT,
ADD COLUMN IF NOT EXISTS total_troops_sent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS planets_captured INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_placement INTEGER;

-- Create game_stats table for detailed end-game statistics
CREATE TABLE IF NOT EXISTS game_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  final_planets_controlled INTEGER,
  final_territory_percentage FLOAT,
  total_troops_sent INTEGER,
  total_troops_lost INTEGER,
  planets_captured INTEGER,
  planets_lost INTEGER,
  structures_built INTEGER,
  total_combat_wins INTEGER,
  total_combat_losses INTEGER,
  peak_territory_percentage FLOAT,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(game_id, player_id)
);

-- Enable RLS on game_stats table
ALTER TABLE game_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow authenticated users to select game stats for games they're in
CREATE POLICY "Players can view stats for their games"
ON game_stats FOR SELECT
TO authenticated
USING (
  game_id IN (
    SELECT gp.game_id 
    FROM game_players gp 
    WHERE gp.player_id = auth.uid()
  )
);

-- RLS Policy: Only service role can insert/update stats (server-side only)
CREATE POLICY "Service role can manage game stats"
ON game_stats FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_stats_game_id ON game_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_game_elimination ON game_players(game_id, is_eliminated);
CREATE INDEX IF NOT EXISTS idx_games_status_winner ON games(status, winner_id);

-- Add index for victory condition queries
CREATE INDEX IF NOT EXISTS idx_game_players_final_placement ON game_players(game_id, final_placement);
