-- Economic System Infrastructure
-- Creates structures table and related indexes/policies

-- Create structures table
CREATE TABLE IF NOT EXISTS structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    structure_type TEXT NOT NULL CHECK (structure_type IN (
        'trade_station',
        'mining_station',
        'colony_station',
        'defense_platform',
        'missile_battery',
        'point_defense'
    )),
    level INTEGER DEFAULT 1 CHECK (level > 0),
    health INTEGER DEFAULT 100 CHECK (health >= 0 AND health <= 100),
    built_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_structures_game_id ON structures(game_id);
CREATE INDEX IF NOT EXISTS idx_structures_system_id ON structures(system_id);
CREATE INDEX IF NOT EXISTS idx_structures_owner_id ON structures(owner_id);
CREATE INDEX IF NOT EXISTS idx_structures_game_owner ON structures(game_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_structures_active ON structures(is_active) WHERE is_active = TRUE;

-- Enable Row Level Security
ALTER TABLE structures ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Players can view all structures in their game
CREATE POLICY "Players can view structures in their game"
    ON structures
    FOR SELECT
    USING (
        game_id IN (
            SELECT game_id 
            FROM game_players 
            WHERE player_id = auth.uid()
        )
    );

-- RLS Policy: Players can insert their own structures
CREATE POLICY "Players can insert their own structures"
    ON structures
    FOR INSERT
    WITH CHECK (
        owner_id = auth.uid()
        AND game_id IN (
            SELECT game_id 
            FROM game_players 
            WHERE player_id = auth.uid()
        )
    );

-- RLS Policy: Players can update their own structures
CREATE POLICY "Players can update their own structures"
    ON structures
    FOR UPDATE
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- RLS Policy: Players can delete their own structures
CREATE POLICY "Players can delete their own structures"
    ON structures
    FOR DELETE
    USING (owner_id = auth.uid());

-- Add comment to table
COMMENT ON TABLE structures IS 'Structures built on planets: Trade Stations, Mining Stations, Colony Stations, Defense Platforms, Missile Batteries, Point Defense systems';
