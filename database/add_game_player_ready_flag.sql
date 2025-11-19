-- Adds an is_ready flag for lobby readiness tracking
alter table public.game_players
  add column if not exists is_ready boolean not null default false;

-- Ensure existing rows default to not ready
update public.game_players
  set is_ready = coalesce(is_ready, false)
where true;

comment on column public.game_players.is_ready is 'Indicates whether the player has readied up in the lobby.';
