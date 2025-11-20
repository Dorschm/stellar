# Stellar Database Setup Guide

This directory contains SQL migrations for setting up your Supabase database with proper security and structure.

## Files (Run in Order)

1. **`00_cleanup_existing_policies.sql`** - Removes conflicting policies
2. **`01_diagnostic_check.sql`** - Verifies current setup
3. **`add_is_public_column.sql`** - Adds public/private game support
4. **`setup_rls_policies.sql`** - Production-ready Row Level Security policies
5. **`add_territory_system.sql`** - Territory expansion system
6. **`add_combat_system.sql`** - Combat logs and mechanics
7. **`fix_game_tick_rls_policies.sql`** - ⚠️ **CRITICAL FIX** for game tick processing
8. **`fix_planet_attacks_rls.sql`** - ⚠️ **CRITICAL FIX** for attack system (anonymous gameplay)
9. **`add_player_activity_tracking.sql`** - Player presence and heartbeat tracking system

⚠️ **IMPORTANT**: If you've already run the territory system migration:
- Ticks not processing? Run `fix_game_tick_rls_policies.sql`
- Attacks not creating? Run `fix_planet_attacks_rls.sql`

## Game Tick System

The game uses a server-side tick system (like OpenFront) where game logic runs on Supabase Edge Functions:

- **Edge Function** (`supabase/functions/game-tick`) processes all game logic server-side
- **game_ticks table** tracks the current tick number for each game
- **territory_sectors table** stores territory expansion data
- **Service Role** is used to bypass RLS for server operations

### How It Works

1. Client triggers tick via Edge Function (every 100ms)
2. Edge Function increments tick_number in game_ticks table
3. Server processes: troop generation, attacks, territory expansion, bot AI
4. Client polls/subscribes to database for updates
5. UI updates in real-time based on server state

### RLS Pattern for Server-Managed Tables

**CRITICAL**: Tables modified by Edge Functions must allow service_role operations:

```sql
-- ✅ CORRECT: Allow service_role to modify, users to read
CREATE POLICY "Service role can update" ON game_ticks
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ❌ WRONG: Blocks ALL operations including service_role
CREATE POLICY "Restrict updates" ON game_ticks
  FOR UPDATE USING (false);
```

See `fix_game_tick_rls_policies.sql` for the correct pattern.

## Player Activity Tracking

The game uses a dual tracking system to detect player disconnections and handle host departures:

### Dual Tracking Approach

1. **Supabase Realtime Presence** - For instant detection of player connect/disconnect
   - Used in GameLobby.tsx and Game.tsx via `channel.track()`
   - Provides real-time updates when players join/leave
   - Handles immediate UI updates and notifications

2. **Database Persistence** - For reliability against network issues
   - `is_active` column: Set to `true` when player connects, `false` on disconnect/unload
   - `last_seen` column: Updated every 30 seconds via heartbeat pings from client
   - Provides durable state that survives temporary network interruptions

### Schema Details

**game_players table additions:**
```sql
is_active BOOLEAN DEFAULT true  -- Current connection state
last_seen TIMESTAMP DEFAULT now()  -- Last heartbeat timestamp
```

Index: `idx_game_players_activity` on `(game_id, is_active)` for efficient queries

### Client-Side Implementation

**Heartbeat Mechanism (30-second interval):**
- When presence is established, client updates `is_active = true` and `last_seen = now()`
- Every 30 seconds, client sends heartbeat: `UPDATE game_players SET last_seen = now()`
- On cleanup (component unmount), client sets `is_active = false`

**Browser Unload Handler:**
- Listens to `beforeunload` event
- Marks player inactive: `UPDATE game_players SET is_active = false`
- Ensures cleanup even if browser crashes or force-closes

### Server-Side Cleanup (game-tick Edge Function)

**Activity Check (every 10 ticks, ~1 second):**

1. **Host Promotion Logic:**
   - Check if host has `is_active = false` OR `last_seen > 60 seconds ago`
   - If host is inactive, find next active player (by placement_order)
   - Reorder `placement_order` to promote new host to position 1
   - Log: `[TICK] Promoted {player_id} to host`

2. **Auto-Close Empty Games:**
   - If ALL players have `is_active = false` AND `last_seen > 5 minutes ago`
   - Update game: `status = 'completed'`, `victory_type = 'abandoned'`
   - Return early from tick processing (game is dead)
   - Log: `[TICK] Game {game_id} marked as abandoned`

### Debugging Queries

**View player activity in a game:**
```sql
SELECT player_id, is_active, last_seen, placement_order 
FROM game_players 
WHERE game_id = 'your-game-id' 
ORDER BY placement_order;
```

**Find stale/inactive players:**
```sql
SELECT * FROM game_players 
WHERE is_active = false 
AND last_seen < now() - interval '5 minutes';
```

**Check for games ready to close:**
```sql
SELECT g.id, g.name, COUNT(gp.player_id) as player_count,
       COUNT(CASE WHEN gp.is_active = true THEN 1 END) as active_count
FROM games g
JOIN game_players gp ON g.id = gp.game_id
WHERE g.status = 'active'
GROUP BY g.id, g.name
HAVING COUNT(CASE WHEN gp.is_active = true THEN 1 END) = 0;
```

### Timeout Constants

- **Heartbeat interval:** 30 seconds (client-side)
- **Host inactivity threshold:** 60 seconds (2 missed heartbeats)
- **Game abandonment threshold:** 5 minutes (300 seconds)
- **Activity check frequency:** Every 10 ticks (~1 second)

## Attack System

The `planet_attacks` table tracks troop movements between planets. Attacks are created by clients and processed by the server-side game-tick function.

### Attack Lifecycle

1. **Client creates attack** via `requestSendTroops` in gameStore
   - Calculates travel time based on distance
   - Stores attack with `status='in_transit'` and `arrival_at` timestamp
   - Deducts troops from source planet immediately

2. **Client animates attack** (Game.tsx + AttackLine.tsx)
   - Polls for attacks every second
   - Converts timestamps to tick numbers for smooth animation
   - Renders moving sphere along line from source to target

3. **Server processes arriving attacks** (game-tick Edge Function)
   - Checks every 100ms for attacks where `arrival_at <= NOW()`
   - Evaluates retreat conditions (attacker troops < defender * 0.3)
   - Checks for encirclement (6-direction surrounding)
   - Resolves combat with terrain/flanking/defense modifiers
   - Updates planet ownership and troop counts
   - Transfers territory sectors on capture

4. **Attack status updated** to 'arrived' or 'retreating'
   - Retreating attacks return 80% of troops to source
   - Client continues animating retreating attacks

### RLS Policies

**CRITICAL**: The attack system uses **anonymous gameplay** (no Supabase Auth required):

- **SELECT**: Players can view attacks in games they're participating in
  - Uses session variable `current_setting('app.player_id')` to identify current player
  - Application **MUST** call `set_player_context(player_id)` RPC before querying attacks
  - Policy checks if that player_id exists in `game_players` for the attack's game_id
  - Example: `await supabase.rpc('set_player_context', { player_id: currentPlayer.id })`
- **INSERT**: Any player can create attacks
  - Client-side validation ensures they own the source planet
  - Server validates ownership before processing
- **UPDATE**: Only service_role (game-tick function) can update status
  - Changes status from 'in_transit' to 'arrived'/'retreating'
- **DELETE**: Only service_role can delete (for maintenance)

**Migration Required**: If attacks aren't creating or visible, run `fix_planet_attacks_rls.sql` to replace the auth-based policies from `add_territory_system.sql` with anonymous-friendly policies that use session variables.

**Application Integration Required**: After applying the migration, update your client code to call `set_player_context` before fetching attacks. See Game.tsx polling logic for implementation location.

## Setup Instructions

⚠️ **IMPORTANT**: Run these scripts in your **Supabase SQL Editor** in EXACT order:

### Step 1: Clean Up Existing Policies

1. Go to **Supabase Dashboard** → **SQL Editor** → **+ New Query**
2. Copy and paste entire contents of `00_cleanup_existing_policies.sql`
3. Click **Run** (or press Ctrl+Enter)
4. **Verify**: The query at the end should return **0 rows** (or only policies on other tables)
   - If you see policies listed, the cleanup worked - they're about to be removed
   - Run the script again if needed

### Step 2: Check Current Status (Optional)

1. Run `01_diagnostic_check.sql`
2. This shows you the current state of RLS and policies
3. Note what you see - helpful for debugging

### Step 3: Add Missing Columns

1. Run entire contents of `add_is_public_column.sql`
2. **Verify**: You should see `Success. No rows returned`
3. If you see error about column already existing, that's fine - skip to next step

### Step 4: Apply RLS Policies

1. Run entire contents of `setup_rls_policies.sql`
2. **Verify**: You should see multiple `Success` messages
3. **Critical**: If you see ANY errors, read them carefully and report them

### Step 5: Verify It Worked

1. Run `01_diagnostic_check.sql` again
2. Check output:
   - **First table**: All tables should show `rls_enabled = true`
   - **Second table**: Should show multiple policies for each table
   - **Third table**: Should show `anon` role has grants
   - **Fourth query**: Should return count without error

### Step 6: Fix Game Tick RLS Policies (If Needed)

If you've already run `add_territory_system.sql` and game ticks are not processing:

1. Run entire contents of `fix_game_tick_rls_policies.sql`
2. **Verify**: You should see success messages and the notice about policies being fixed
3. Check Supabase Edge Function logs to confirm ticks are now processing

This migration fixes overly restrictive RLS policies that block game tick updates.

### Step 7: Fix Attack System RLS Policies (If Needed)

If attacks are not creating (check browser console for RLS policy errors):

1. Run entire contents of `fix_planet_attacks_rls.sql`
2. **Verify**: You should see success messages about policies being fixed
3. Try creating an attack again

This migration fixes auth-based policies that don't work with anonymous players.

If Step 5 passes, restart your dev server and try creating a game!

## Security Model

The RLS policies implement the following security rules:

### Players
- ✅ **Create**: Anyone (anonymous gameplay)
- ✅ **Read**: Anyone (for displaying usernames)
- ✅ **Update**: Anyone (for resource changes)
- ❌ **Delete**: No one (data retention)

### Games
- ✅ **Create**: Anyone
- ✅ **Read**: Anyone can see waiting games, only participants see active games
- ✅ **Update**: Only host (first player by placement_order)
- ✅ **Delete**: Only host, only waiting games

### Game Players
- ✅ **Create**: Anyone can join waiting games
- ✅ **Read**: Anyone (for lobby lists)
- ✅ **Update**: Participants only
- ✅ **Delete**: Can leave waiting games only

### Systems
- ✅ **Create**: Service only (galaxy generation)
- ✅ **Read**: Game participants only
- ✅ **Update**: Game participants only
- ❌ **Delete**: No one (data integrity)

### Fleets
- ✅ **Create**: Fleet owner + game participant
- ✅ **Read**: All game participants
- ✅ **Update**: Fleet owner only
- ✅ **Delete**: Fleet owner only

## Performance

The policies include optimized indexes for:
- Game player lookups
- Host identification (placement_order)
- System ownership queries
- Game status filtering

## Migration to Authenticated Users

Currently using anonymous players (username only). To add Supabase Auth:

1. Add `user_id uuid REFERENCES auth.users` to players table
2. Update policies to check `auth.uid() = user_id`
3. Modify signup flow to link Auth users to players
4. Add email/password or OAuth providers

See comments in `setup_rls_policies.sql` for details.

## Testing Policies

After running the migrations, test that:

1. ✅ You can create a player
2. ✅ You can create a game
3. ✅ You can join a game
4. ✅ Host can start the game
5. ✅ Non-host cannot start the game
6. ✅ Game systems are generated
7. ✅ Players can only see their game's data

## Troubleshooting

### "permission denied for table X"
- Run `setup_rls_policies.sql` 
- Check policies exist: Go to **Table Editor** → Select table → **Policies** tab

### Policies not working
- Clear browser cache
- Check Supabase logs in Dashboard → **Logs** → **Postgres Logs**
- Verify player_id matches across queries

### Attacks Not Creating

**Symptoms:**
- Clicking "Send 50%" does nothing
- No attack lines appear on map
- Console shows RLS policy errors
- Database query shows no rows in `planet_attacks` table

**Diagnosis:**
1. Check browser console for `[ATTACK]` messages:
   - `[ATTACK] Creating attack:` should appear when you click send
   - If you see `Failed to create attack` with RLS policy error, policies are wrong

2. Check if `fix_planet_attacks_rls.sql` has been applied:
   ```sql
   SELECT policyname FROM pg_policies WHERE tablename = 'planet_attacks';
   ```
   - Should see "Players can view attacks in their games (anonymous)"
   - Should NOT see policies checking `auth.uid()`

3. Verify player is in game:
   ```sql
   SELECT * FROM game_players WHERE player_id = 'your-player-id' AND game_id = 'your-game-id';
   ```

**Solution:**
- Run `fix_planet_attacks_rls.sql` migration
- This replaces auth-based policies with anonymous-friendly policies
- Restart your game after applying the fix

### Attacks Not Animating

**Symptoms:**
- Attacks created successfully but not visible on map
- No moving spheres or attack lines
- Query returns 0 rows even though attacks exist in database

**Diagnosis:**
1. **Check if player context is set**: The RLS policy requires calling `set_player_context` before querying
   - Add this before fetching attacks: `await supabase.rpc('set_player_context', { player_id: player.id })`
   - Without this, the SELECT policy will block all attack queries
   
2. Check that `currentTick` is incrementing (should see in HUD)

3. Verify attacks have valid `arrival_at` timestamps:
   ```sql
   SELECT id, arrival_at, status FROM planet_attacks WHERE game_id = 'your-game-id';
   ```
   
4. Check AttackLine component logs:
   - `[ATTACK LINE] Rendering attack:` with progress percentage

**Solution:**
- **Most common issue**: Add `set_player_context` RPC call in Game.tsx before fetching attacks
- Ensure game tick system is working (see "Game ticks not processing" below)
- Verify `mapAttackRowToAttack` is converting timestamps correctly
- Check that attacks aren't already 'arrived' (should be 'in_transit' or 'retreating')

### Game ticks not processing

**Symptoms:**
- Troops not growing
- Attacks not resolving
- Territory not expanding
- Tick number not incrementing

**Diagnosis:**
1. Check browser console for `[CLIENT] Tick updated:` messages
   - If you see these, client is receiving updates ✅
   - If not, server may be failing to update database ❌

2. Check Supabase Edge Function logs:
   - Go to **Dashboard** → **Edge Functions** → **game-tick** → **Logs**
   - Look for `[TICK] ERROR: Failed to update tick number` messages
   - If you see "RLS policy" errors, run `fix_game_tick_rls_policies.sql`

3. Query game_ticks table directly:
   ```sql
   SELECT * FROM game_ticks WHERE game_id = 'your-game-id';
   ```
   - Check if tick_number and last_tick_at are updating
   - If stuck at tick 0 or not updating, RLS policies are blocking

**Solution:**
- Run `fix_game_tick_rls_policies.sql` migration
- This fixes blocking `USING (false)` policies on game_ticks and territory_sectors
- Restart your game after applying the fix

### Performance issues
- Check if indexes were created
- Run `EXPLAIN ANALYZE` on slow queries
- Consider adding more specific indexes
- Territory expansion now uses optimized single query instead of per-planet queries

## Reference

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Policy Documentation](https://www.postgresql.org/docs/current/sql-createpolicy.html)
