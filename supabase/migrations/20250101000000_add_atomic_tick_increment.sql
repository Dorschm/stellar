-- Create a function to atomically increment the game tick
create or replace function increment_game_tick(
  p_game_id uuid,
  p_timestamp timestamptz
) returns integer
language plpgsql
security definer
as $$
declare
  v_tick_number integer;
begin
  -- Try to atomically increment the tick number
  update game_ticks
  set 
    tick_number = tick_number + 1,
    last_tick_at = p_timestamp
  where game_id = p_game_id
  returning tick_number into v_tick_number;
  
  -- If no rows were updated, the game_ticks row doesn't exist yet
  if not found then
    raise exception 'Game tick tracker not found for game_id: %', p_game_id;
  end if;
  
  -- Return the new tick number
  return v_tick_number;
end;
$$;

-- Grant execute permission to authenticated users
revoke all on function increment_game_tick from public;
grant execute on function increment_game_tick to authenticated;
