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
