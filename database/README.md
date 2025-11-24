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
10. **`add_game_players_missing_columns.sql`** - ⚠️ **CRITICAL**: Renames `color` to `empire_color`, adds `is_alive`, `systems_controlled`, and stats columns. Required for game creation and tick processing.
11. **`fix_cors_and_rls_policies.sql`** - ⚠️ **CRITICAL FIX** for structures table schema and auth-based policies (note: only verifies game_players policies which are already anonymous-friendly from setup_rls_policies.sql)
12. **`add_economic_columns.sql`** - ⚠️ **REQUIRED** Adds economic resource columns to players table and gameplay columns to systems table

⚠️ **CRITICAL**: If you see 'credits column not found' or 'troop_count column not found' errors, run this migration immediately and reload schema cache.

⚠️ **IMPORTANT**: If you've already run the territory system migration:
- Ticks not processing? Run `fix_game_tick_rls_policies.sql`
- Attacks not creating? Run `fix_planet_attacks_rls.sql`
- Structures table missing game_id column? `fix_cors_and_rls_policies.sql` will add it automatically
- game_players policies are configured by `setup_rls_policies.sql` and verified by `fix_cors_and_rls_policies.sql`

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

**Application Integration Required**: After applying the migration, update your client code to call `set_player_context` before fetching attacks or structures.

**Example usage:**
```typescript
// Set player context once per session or when player changes
await supabase.rpc('set_player_context', { player_id: currentPlayer.id });

// Now queries will use this player context for RLS checks
const { data: attacks } = await supabase.from('planet_attacks').select('*');
const { data: structures } = await supabase.from('structures').select('*');
```

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

### Structures
- ✅ **Create**: Structure owner only (current player must match owner_id)
- ✅ **Read**: Game participants only (current player must be in game)
- ✅ **Update**: Structure owner only (current player must match owner_id)
- ✅ **Delete**: Structure owner only (current player must match owner_id)
- Uses anonymous-friendly policies after `fix_cors_and_rls_policies.sql` migration
- **Requires**: Application must call `set_player_context(player_id)` before queries
- **Schema**: id, game_id, system_id, owner_id, structure_type, level, health, built_at, is_active, created_at

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

### Comprehensive Schema Diagnostics

Before troubleshooting specific errors, run `database/comprehensive_schema_diagnostic.sql` to check for missing columns across all critical tables (games, game_players, systems, players). This identifies schema mismatches that cause 'Could not find column in schema cache' errors. See `database/SCHEMA_FIX_GUIDE.md` for a complete step-by-step fix workflow.

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

### Structures Not Creating or Visible

**Symptoms:**
- Building structures fails with permission denied errors
- Structures table queries return 0 rows even though structures exist
- Console shows RLS policy errors (400/406 errors)

**Diagnosis:**
1. Check if `fix_cors_and_rls_policies.sql` has been applied:
   ```sql
   SELECT policyname FROM pg_policies WHERE tablename = 'structures';
   ```
   - Should see: `structures_select_policy`, `structures_insert_policy`, `structures_update_policy`, `structures_delete_policy`
   - Should NOT see policies checking `auth.uid()`

2. **Check if player context is set**: The RLS policies require calling `set_player_context` before querying
   - Add this before fetching structures: `await supabase.rpc('set_player_context', { player_id: player.id })`
   - Without this, the SELECT policy will block all structure queries

3. Verify `set_player_context` function exists:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'set_player_context';
   ```
   - Should return one row with `proname = set_player_context`

4. Test with player context set:
   ```sql
   -- Set context for a player in the game
   SELECT set_player_context('your-player-id'::uuid);
   
   -- Now query should work
   SELECT * FROM structures WHERE game_id = 'your-game-id';
   ```

**Solution:**
- Run `fix_cors_and_rls_policies.sql` migration (includes function and policies)
- Update client code to call `set_player_context` before any structure queries
- Example location: In your game initialization or player selection logic
- Reference implementation: See how `planet_attacks` queries use `set_player_context`

### PGRST204 Schema Cache Errors

**Symptoms:**
- Console shows repeating errors: `Failed to load resource: the server responded with a status of 400 ()` 
- Error message: `{"code": "PGRST204", "message": "Could not find the 'column_name' column of 'table_name' in the schema cache"}` 
- PATCH/POST requests fail even though the column exists in the database
- Occurs after running migrations that add new columns

**Diagnosis:**
1. Verify the column exists in the database:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'game_players' 
   AND column_name IN ('is_active', 'last_seen');
   ```
   - Should return 2 rows showing both columns exist
   - If no rows returned, the migration hasn't been applied yet

2. Check PostgREST schema cache timestamp:
   - Go to Supabase Dashboard → Project Settings → API
   - Look for "Schema Cache" section
   - Note the last refresh timestamp

3. Verify the migration was applied:
   ```sql
   SELECT EXISTS (
     SELECT 1 FROM pg_indexes 
     WHERE indexname = 'idx_game_players_activity'
   );
   ```
   - Should return `true` if migration was applied

**Solution:**
1. **Apply the migration** (if not already done):
   - Run `database/add_player_activity_tracking.sql` in Supabase SQL Editor
   - Verify success messages appear

2. **Reload PostgREST schema cache**:
   - Go to Supabase Dashboard → Project Settings → API
   - Scroll to "Schema Cache" section
   - Click **Reload Schema** button
   - Wait for confirmation (2-5 seconds)
   - Verify timestamp updates

3. **Test the fix**:
   - Refresh your application in the browser
   - Check DevTools Console for PGRST204 errors (should be gone)
   - Verify PATCH requests to `game_players` succeed (status 200/204)
   - Join a game and confirm heartbeat updates work every 30 seconds

**Prevention:**
- Always reload schema cache after running migrations that modify table structure
- Document schema cache refresh in deployment procedures
- Consider automating cache refresh in CI/CD pipelines

**Reference:**
- See `SUPABASE_SCHEMA_CACHE_REFRESH.md` for detailed cache refresh instructions
- PostgREST caches schema for performance but must be manually refreshed after DDL changes
- For a comprehensive check of all tables, use `database/comprehensive_schema_diagnostic.sql` and follow `database/SCHEMA_FIX_GUIDE.md`.

### "Could not find the 'empire_color' column of 'game_players' in the schema cache"

**Cause**: The `add_game_players_missing_columns.sql` migration has not been applied, or the schema cache was not reloaded after applying it
**Affected Operations**: Creating games (via `gameService.createGame`), joining games, starting games, tick processing
**Solution**:
1. Verify migration was applied: `SELECT column_name FROM information_schema.columns WHERE table_name = 'game_players' AND column_name = 'empire_color';` (should return 1 row)
2. If query returns 0 rows, run `database/add_game_players_missing_columns.sql` in Supabase SQL Editor
3. **MANDATORY**: Reload schema cache via Dashboard → Settings → API → Reload Schema (see `SUPABASE_SCHEMA_CACHE_REFRESH.md`)
4. Test by creating a new game - should succeed without errors
**Related Issues**: Similar errors for `is_alive`, `systems_controlled`, `is_eliminated` columns indicate the same root cause
- See `database/SCHEMA_FIX_GUIDE.md` for a comprehensive workflow covering all missing columns.

### "Could not find the 'difficulty' column of 'games' in the schema cache"

**Symptoms:**
- Game creation fails immediately with error: "Could not find the 'difficulty' column of 'games' in the schema cache"
- Error occurs when clicking "Create Game" button
- Console shows 400 or PGRST204 errors
- Prevents all gameplay as games cannot be created

**Diagnosis:**
1. Verify column exists in database:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'games' AND column_name = 'difficulty';
   ```
   - If returns 1 row: Column exists, schema cache needs reload
   - If returns 0 rows: Migration not applied yet

**Solution:**
1. Run `database/add_difficulty_column.sql` in Supabase SQL Editor (if not already applied)
2. Go to Supabase Dashboard → Project Settings → API
3. Click **Reload Schema** button in Schema Cache section
4. Wait for timestamp to update (2-5 seconds)
5. Refresh browser and try creating a game again

**Verification:**
- Game creation succeeds without errors
- Console shows: "Created game <id> with creator <player_id>"
- Bots are added with specified difficulty when game starts

**Reference:**
- See `SUPABASE_SCHEMA_CACHE_REFRESH.md` for detailed cache reload instructions
- See lines 452-511 below for PGRST204 troubleshooting workflow
- Difficulty values: 'easy', 'normal', 'hard' (stored in games table, passed to bot creation RPC)
- For a comprehensive diagnostic covering all tables, see `database/SCHEMA_FIX_GUIDE.md`.

### "Could not find the 'credits' column" or "troop_count column not found" Errors

**Symptoms:**
- Game creation fails with error: "Could not find the 'credits' column of 'players' in the schema cache"
- Bot creation fails when starting games
- Console shows errors about missing columns: `credits`, `energy`, `minerals`, `research_points` (players table)
- System generation fails with errors about: `troop_count`, `energy_generation`, `has_minerals`, `in_nebula` (systems table)
- Functions like `deduct_troops` fail with "column does not exist" errors

**Diagnosis:**
1. Check if economic columns exist in players table:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'players' 
   AND column_name IN ('credits', 'energy', 'minerals', 'research_points');
   ```
   - Should return 4 rows
   - If 0 rows, migration hasn't been applied

2. Check if gameplay columns exist in systems table:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'systems' 
   AND column_name IN ('troop_count', 'energy_generation', 'has_minerals', 'in_nebula');
   ```
   - Should return 4 rows
   - If you see 'troops' instead of 'troop_count', migration hasn't been applied

3. Verify bot creation function references:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'create_bot_player';
   ```
   - Check if INSERT statement includes credits, energy, minerals, research_points

**Root Cause:**
- The base schema in `FULL_DATABASE_SETUP.sql` (prior to this migration) didn't include economic resource columns
- Code in `add_bot_players.sql` and `gameService.ts` expects these columns to exist
- The `systems` table used `troops` but all code references `troop_count` 
- This mismatch causes INSERT failures when creating bots or generating maps

**Solution:**
1. **Apply the migration**:
   - Run `database/add_economic_columns.sql` in Supabase SQL Editor
   - Verify success messages for each ALTER TABLE statement
   - Check that data migration completed (existing troops copied to troop_count)

2. **Reload PostgREST schema cache** (CRITICAL):
   - Go to Supabase Dashboard → Project Settings → API
   - Click **Reload Schema** button in "Schema Cache" section
   - Wait for confirmation (2-5 seconds)
   - Verify timestamp updates

3. **Test the fix**:
   - Create a new game in your application
   - Start the game (which triggers bot creation)
   - Verify bots are added successfully (check game_players table)
   - Confirm no console errors about missing columns
   - Check that systems have troop_count values (not NULL)

4. **For fresh database setups**:
   - Use the updated `FULL_DATABASE_SETUP.sql` which includes these columns in base schema
   - No separate migration needed for new projects

**Prevention:**
- Always run migrations in documented order
- Reload schema cache after any DDL changes (ALTER TABLE, CREATE TABLE)
- Use `IF NOT EXISTS` clauses in migrations for idempotency
- Test bot creation and game start after schema changes

**Reference:**
- See `add_economic_columns.sql` for detailed column definitions and defaults
- See `add_bot_players.sql` line 39 for INSERT statement requiring these columns
- See `gameService.ts` lines 248-252 for systems column requirements
- For a comprehensive check of all missing columns, run `database/comprehensive_schema_diagnostic.sql` and follow `database/SCHEMA_FIX_GUIDE.md`.

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

## Debugging Tick Processing and Resource Generation

### Step-by-Step Diagnostic Instructions

If you're experiencing issues with tick processing, troop growth, or resource generation, follow these diagnostic steps to identify the root cause:

#### 1. Check if game_ticks table is being updated

Run this query to verify the game tick system is active:

```sql
SELECT game_id, tick_number, last_tick_at 
FROM game_ticks 
WHERE game_id = '<your-game-id>' 
ORDER BY last_tick_at DESC 
LIMIT 1;
```

**Expected result:**
- `last_tick_at` should show a recent timestamp (within last 5 seconds)
- `tick_number` should be a large number that increments when you run the query again after 1 second

**If no results or stale timestamp:**
- The game-tick Edge Function is not running or failing
- Check Edge Function logs in Supabase Dashboard
- Verify RLS policies allow service_role INSERT/UPDATE on game_ticks table
- See `fix_game_tick_rls_policies.sql` for correct policy configuration

#### 2. Verify Edge Function is running

Check Supabase Dashboard → Edge Functions → game-tick → Logs for:

- `[TICK] Successfully updated tick to X for game Y` - confirms tick updates are working
- `[TICK] Troop generation complete: +X troops across Y planets` - confirms troop generation is running
- `[TICK] Player Z: Credits +X (...), Energy +X (...), Minerals +X (...)` - confirms resource generation per player
- `[TICK] Resource generation complete for X players` - confirms all players processed

**If no logs or errors:**
- Edge Function may not be deployed or invoked
- Check browser console for `[CLIENT] Triggering game tick` logs (should appear every second)
- Verify game status is 'active' in games table
- Check for CORS errors blocking Edge Function invocation

#### 3. Confirm RLS policies allow service_role operations

Run this query to check policies on game_ticks table:

```sql
SELECT policyname, cmd, roles, qual, with_check 
FROM pg_policies 
WHERE tablename = 'game_ticks';
```

**Expected result:**
Should include policies like:
- `Service role can update game_ticks` with roles `{service_role}` and cmd `UPDATE`
- `Service role can insert game_ticks` with roles `{service_role}` and cmd `INSERT`

**If missing or incorrect:**
- Run `fix_game_tick_rls_policies.sql` migration
- This adds proper service_role policies for server-side operations

#### 4. Check player resources are updating

Run this query twice with a 5-second gap to see if resources increase:

```sql
SELECT id, username, credits, energy, minerals 
FROM players 
WHERE id = '<your-player-id>';
```

**Expected result:**
- Second query should show increased `credits` (if you own planets)
- `energy` should increase based on planet count
- `minerals` should increase if you have mining stations on mineral-rich planets

**If resources are not increasing:**
- Check if you own any planets: `SELECT COUNT(*) FROM systems WHERE owner_id = '<player-id>' AND game_id = '<game-id>'`
- If count is 0, you have no income (need to capture planets)
- If count > 0, check Edge Function logs for resource generation errors
- Verify planets table has required columns: `troop_count`, `energy_generation`, `has_minerals`

#### 5. Verify troops are growing on owned planets

Run this query to check troop counts:

```sql
SELECT id, name, troop_count, owner_id 
FROM systems 
WHERE game_id = '<game-id>' 
AND owner_id IS NOT NULL 
LIMIT 5;
```

Run again after 10 seconds to see if `troop_count` increases.

**Expected result:**
- `troop_count` should increase based on OpenFront formula: `base = 10 + (troops^0.73)/4`, `growth = base * (1 - troops/maxTroops)`
- Planets with low troops should grow faster than planets near max capacity (500 + bonuses)

**If troops are not growing:**
- Check Edge Function logs for `[TICK] Updated troop counts for X planets` messages
- Verify `troop_count` column exists (not `troops`): 
  ```sql
  SELECT column_name FROM information_schema.columns WHERE table_name = 'systems' AND column_name = 'troop_count';
  ```
- If column is missing or named `troops`, run `add_economic_columns.sql` migration
- Reload schema cache after migration: Dashboard → Settings → API → Reload Schema

### Common Issues and Solutions

#### Issue: "No tick data found" warning in browser console

**Cause:** `game_ticks` table is empty for the game, or RLS policies block client access.

**Solution:**
1. Ensure game status is 'active': `SELECT status FROM games WHERE id = '<game-id>'`
2. Verify Edge Function is being invoked: Check for `[CLIENT] Triggering game tick` logs in browser console every second
3. Check Edge Function can create tick records: Run `fix_game_tick_rls_policies.sql` to add service_role policies
4. Verify client can read tick records: Policies should allow SELECT for authenticated/anon users

#### Issue: Resources not increasing

**Cause 1:** Player owns no planets (no income source).

**Solution:** Capture planets by sending troops to neutral/enemy systems.

**Cause 2:** Edge Function resource generation is failing.

**Solution:**
1. Check Edge Function logs for errors during resource generation
2. Verify players table has columns: `credits`, `energy`, `minerals` (run `add_economic_columns.sql` if missing)
3. Reload schema cache after adding columns
4. Check for constraint violations or null values in player resources

**Cause 3:** Client is not polling or fetching player data.

**Solution:**
1. Check browser console for `[CLIENT] Resources updated:` logs (should appear every second)
2. Verify `setPlayer()` is called with updated player data
3. Check store logs for resource deltas: `[STORE] Resources updated:` with old/new/delta values

#### Issue: Troops not growing

**Cause 1:** Planets have no owner (neutral planets don't generate troops).

**Solution:** Only owned planets generate troops. Capture planets by sending attacks.

**Cause 2:** Troop generation code is not running in Edge Function.

**Solution:**
1. Check Edge Function logs for `[TICK] Troop generation complete:` messages
2. Verify OpenFront formula is being applied (logs should show base, ratio, growth values)
3. Check for errors during troop update queries

**Cause 3:** `troop_count` column missing or misnamed.

**Solution:**
1. Verify column name: `SELECT column_name FROM information_schema.columns WHERE table_name = 'systems' AND column_name = 'troop_count'`
2. If named `troops`, run `add_economic_columns.sql` to rename to `troop_count`
3. Reload schema cache after migration

### Expected Behavior Reference

Use this as a baseline to verify your game is working correctly:

#### Tick Processing
- **Tick increment rate:** Every 100ms (10 ticks/second)
- **Browser console logs:** `[CLIENT] Tick updated` every second with incrementing tick numbers
- **Edge Function logs:** `[TICK] Successfully updated tick to X` every 100ms (may be throttled in logs)

#### Resource Generation  
- **Credits:** +10 per owned planet per tick
- **Energy:** Base 100 + (ownedPlanets^0.6 * 100) per tick, modified by efficiency (optimal at 42% capacity)
- **Minerals:** +50 per Mining Station on mineral-rich planets per tick
- **Resource logging:** `[TICK] Player X: Credits +Y (...), Energy +Z (...)` in Edge Function logs
- **Client sync:** `[STORE] Resources updated:` and `[CLIENT] Resources updated:` logs show deltas every second

#### Troop Growth
- **Formula:** `base = 10 + (troops^0.73)/4`, `growth = base * (1 - troops/maxTroops)`
- **Growth rate:** Faster when troops are low, slower when approaching max
- **Max troops:** 500 base + 100 per Colony Station level
- **Logging:** `[TICK] Planet X (Owner: Y): A -> B troops` for first 5 planets per tick
- **Client display:** HUD shows growth rate and efficiency percentage for selected planet

#### Client-Side Polling
- **Game state fetch:** Every 1 second
- **Expected logs:** 
  - `[CLIENT] Fetching tick data for game X`
  - `[CLIENT] Tick fetched successfully:` with gameId, previousTick, newTick, timestamp
  - `[CLIENT] Fetching player resources for X`
  - `[CLIENT] Resources updated:` with old/new/delta for each resource

### Links to Related Files

Refer to these migrations if you need to fix specific issues:

- **`fix_game_tick_rls_policies.sql`** - Fixes RLS policies blocking game tick updates
- **`fix_cors_and_rls_policies.sql`** - Fixes CORS issues and auth-based RLS policies for structures
- **`add_economic_columns.sql`** - Adds missing resource columns to players and systems tables

Check these code files for implementation details:

- **`supabase/functions/game-tick/index.ts`** - Server-side game logic (troop growth, resource generation, combat)
- **`src/store/gameStore.ts`** - Client-side resource state management
- **`src/components/Game.tsx`** - Client polling and Edge Function invocation
- **`src/components/HUD.tsx`** - Resource and troop growth display
- **`src/game/ResourceSystem.ts`** - Resource calculation formulas

### Performance issues
- Check if indexes were created
- Run `EXPLAIN ANALYZE` on slow queries
- Consider adding more specific indexes
- Territory expansion now uses optimized single query instead of per-planet queries

### Edge Function CORS Errors

**Symptoms:**
- Browser console shows "blocked by CORS policy"
- "No 'Access-Control-Allow-Origin' header" errors
- Edge Function invocations fail from localhost:3000
- POST requests to /game-tick return network errors

**Diagnosis:**
1. Check browser console for CORS preflight errors
2. Verify game-tick function has OPTIONS handler:
   - Check `supabase/functions/game-tick/index.ts` for OPTIONS method handling
3. Verify CORS headers in all responses (success and error)

**Solution:**
- Ensure `game-tick/index.ts` includes CORS headers in all responses
- Add OPTIONS method handler for preflight requests
- Include `Access-Control-Allow-Origin: *` in all Response headers
- Reference pattern: `supabase/functions/mark-inactive/index.ts` has correct CORS implementation

## Setup Instructions

### Step 1: Create Tables
Run migrations 1-6 in order to set up the base schema.

### Step 2: Apply Critical Fixes
Run migrations 7-9 to fix RLS policies for game functionality.

### Step 2.5: Add Economic and Gameplay Columns (If Missing)
If you're migrating an existing database that was set up before this migration existed:
1. Run `add_economic_columns.sql` in Supabase SQL Editor
2. Verify all ALTER TABLE statements succeed
3. **CRITICAL**: Reload schema cache (Dashboard → Settings → API → Reload Schema)
4. Test game creation and bot spawning

Skip this step if:
- You're using the latest `FULL_DATABASE_SETUP.sql` (already includes these columns)
- You've already run this migration successfully
- Diagnostic query shows all 8 columns exist (4 in players, 4 in systems)

### Step 3: Fix Remaining Auth-Based Policies (If Needed)
If you see 400/406 errors or "auth.uid()" errors in console:
- Run `fix_cors_and_rls_policies.sql` migration
- This fixes structures table schema and replaces auth-based policies with anonymous-friendly policies
- Verifies game_players policies (which are already anonymous-friendly from setup_rls_policies.sql)
- Creates `set_player_context` RPC function for session-based player identification
- **Important**: Application must call `set_player_context` before querying structures
  ```typescript
  await supabase.rpc('set_player_context', { player_id: currentPlayer.id });
  ```

### Step 4: Deploy Edge Functions
Deploy the game-tick and mark-inactive Edge Functions with proper CORS support.

### Step 5: Verify Setup

0. Verify economic and gameplay columns exist:
   ```sql
   -- Should return 8 rows total (4 from each table)
   SELECT table_name, column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name IN ('players', 'systems')
   AND column_name IN ('credits', 'energy', 'minerals', 'research_points', 
                       'troop_count', 'energy_generation', 'has_minerals', 'in_nebula')
   ORDER BY table_name, column_name;
   ```

1. Check that game ticks are processing (tick number incrementing)
2. Verify structures can be created and queried
   ```sql
   -- Set player context first (replace with actual player_id)
   SELECT set_player_context('00000000-0000-0000-0000-000000000000'::uuid);
   
   -- Now query structures (will only show structures in games this player is in)
   SELECT id, game_id, system_id, owner_id, structure_type, level
   FROM structures
   LIMIT 5;
   ```
3. Confirm attacks are animating properly
4. Test player activity tracking works
5. Verify all indexes are present:
   ```sql
   SELECT tablename, indexname
   FROM pg_indexes
   WHERE tablename IN ('game_ticks', 'territory_sectors', 'structures', 'game_players')
   AND indexname LIKE 'idx_%'
   ORDER BY tablename, indexname;
   ```

## Reference

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Policy Documentation](https://www.postgresql.org/docs/current/sql-createpolicy.html)
