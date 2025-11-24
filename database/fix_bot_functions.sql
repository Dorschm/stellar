-- Fix for "Could not find the function public.add_bots_to_game" error
-- This script updates the bot creation functions to match the application code signature
-- Specifically, it adds the 'p_difficulty' parameter to the functions

-- 1. Ensure players table has bot_difficulty column
ALTER TABLE players ADD COLUMN IF NOT EXISTS bot_difficulty TEXT DEFAULT 'normal';

-- 1.5 Ensure helper function exists
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

-- 2. Update create_bot_player function to accept difficulty
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

-- 3. Update add_bots_to_game function to accept difficulty
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

-- 4. Verify the function exists with correct signature
DO $$
BEGIN
    RAISE NOTICE 'Verifying add_bots_to_game signature...';
END $$;

SELECT p.proname as function_name, pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
WHERE p.proname = 'add_bots_to_game';
