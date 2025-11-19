-- Create bot players for OpenFront-style AI opponents

-- Add difficulty column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS bot_difficulty TEXT DEFAULT 'normal';

-- Create index for efficient bot queries
CREATE INDEX IF NOT EXISTS idx_players_is_bot ON players(is_bot) WHERE is_bot = true;

-- Function to generate random bot names
CREATE OR REPLACE FUNCTION generate_random_bot_name()
RETURNS TEXT AS $$
DECLARE
  prefixes TEXT[] := ARRAY['Stellar', 'Nova', 'Quantum', 'Nebula', 'Cosmic', 'Void', 'Astral', 'Galactic', 'Solar', 'Lunar'];
  suffixes TEXT[] := ARRAY['Commander', 'Empire', 'Federation', 'Collective', 'Alliance', 'Dominion', 'Legion', 'Armada', 'Fleet', 'Dynasty'];
  random_prefix TEXT;
  random_suffix TEXT;
  random_number INTEGER;
BEGIN
  random_prefix := prefixes[floor(random() * array_length(prefixes, 1)) + 1];
  random_suffix := suffixes[floor(random() * array_length(suffixes, 1)) + 1];
  random_number := floor(random() * 900) + 100; -- 3-digit number between 100-999
  
  RETURN random_prefix || ' ' || random_suffix || ' ' || random_number;
END;
$$ LANGUAGE plpgsql;

-- Function to create individual bot players
CREATE OR REPLACE FUNCTION create_bot_player(p_difficulty TEXT DEFAULT 'normal')
RETURNS UUID AS $$
DECLARE
  bot_id UUID;
  bot_name TEXT;
  bot_email TEXT;
BEGIN
  bot_id := gen_random_uuid();
  bot_name := generate_random_bot_name();
  bot_email := 'bot_' || replace(bot_id::text, '-', '') || '@stellar.ai';
  
  INSERT INTO public.players (id, username, email, is_bot, bot_difficulty, credits, energy, minerals, research_points)
  VALUES (bot_id, bot_name, bot_email, true, p_difficulty, 1000, 1000, 500, 0)
  ON CONFLICT (id) DO NOTHING;
  
  RETURN bot_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add bots to games that need them
CREATE OR REPLACE FUNCTION add_bots_to_game(p_game_id UUID, p_num_bots INTEGER, p_difficulty TEXT DEFAULT 'normal')
RETURNS void AS $$
DECLARE
  current_players INTEGER := 0;
  max_players INTEGER := 0;
  bot_id UUID;
  placement INTEGER;
  slots_available INTEGER := 0;
BEGIN
  -- Fetch max players for the game
  SELECT g.max_players INTO max_players
  FROM games g
  WHERE g.id = p_game_id;

  IF max_players IS NULL THEN
    RAISE NOTICE 'Game % not found when adding bots', p_game_id;
    RETURN;
  END IF;

  -- Count current human/bot players in the game
  SELECT COUNT(*) INTO current_players
  FROM game_players gp
  WHERE gp.game_id = p_game_id;

  placement := current_players + 1;
  slots_available := GREATEST(max_players - current_players, 0);

  -- Add bots up to requested amount or available slots
  FOR i IN 1..LEAST(p_num_bots, slots_available) LOOP
    -- Create a new bot player with specified difficulty
    bot_id := create_bot_player(p_difficulty);
    
    EXIT WHEN bot_id IS NULL;

    INSERT INTO game_players (game_id, player_id, empire_color, is_alive, placement_order, is_ready)
    VALUES (
      p_game_id,
      bot_id,
      '#' || substr(md5(random()::text), 1, 6), -- Random color
      true,
      placement,
      true -- Bots are always ready
    );
    
    placement := placement + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
