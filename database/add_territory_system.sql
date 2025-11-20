-- Add territory expansion system (like OpenFront's tile growth)
-- Each planet controls sectors of space that expand over time

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
