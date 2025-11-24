# Supabase Schema Cache Refresh Guide

This guide explains how to refresh PostgREST's schema cache after running database migrations that modify table structures.

## Why This Is Needed

PostgREST caches the database schema for performance optimization. After running migrations that add or remove columns, the cache must be manually refreshed to prevent PGRST204 errors.

**Common scenario:** You run a migration that adds new columns (like `is_active` and `last_seen` to `game_players`), but your application immediately receives PGRST204 errors saying those columns don't exist—even though they're in the database. This happens because PostgREST's cached schema is stale and doesn't know about the new columns yet.

## Step-by-Step Instructions

### Method 1: Dashboard Reload (Recommended)

1. Navigate to your **Supabase Dashboard** (https://supabase.com/dashboard)

2. Select your project from the project list

3. Go to **Project Settings** (gear icon in the left sidebar)

4. Click the **API** section

5. Scroll down to the **Schema Cache** section

6. Click the **Reload Schema** button

7. Wait for confirmation message (usually 2-5 seconds)

8. Verify the timestamp updates to show the cache was refreshed

### Method 2: API Method (Advanced)

If you have access to your project's service role key:

```bash
# Send POST request to reload schema endpoint
curl -X POST https://<your-project-ref>.supabase.co/rest/v1/rpc/reload_schema \
  -H "apikey: <your-service-role-key>" \
  -H "Authorization: Bearer <your-service-role-key>"
```

**Warning:** Never expose service role keys in client-side code or public repositories.

## Verification Steps

After reloading the schema cache, verify the fix worked:

### 1. Check Browser DevTools Console

1. Open your application in the browser
2. Press `F12` to open DevTools
3. Go to the **Console** tab
4. Refresh the page
5. Look for PGRST204 errors—they should be **gone**

### 2. Check Network Tab

1. In DevTools, go to the **Network** tab
2. Filter by `Fetch/XHR`
3. Join a game or trigger heartbeat updates
4. Look for PATCH requests to `game_players`
5. Verify they return status `200` or `204` (success)
6. Check response body—should not contain `"code": "PGRST204"`

### 3. Verify Heartbeat Updates Work

1. Join a game lobby or active game
2. Watch the Network tab for 30-60 seconds
3. You should see PATCH requests every 30 seconds updating `last_seen`
4. All requests should succeed (green in Network tab)

### 4. Database Query Verification

Run this query in the Supabase SQL Editor:

```sql
-- Verify columns exist in the database
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'game_players' 
AND column_name IN ('is_active', 'last_seen');
```

Expected result: 2 rows showing both columns exist

```sql
-- Verify index was created
SELECT EXISTS (
  SELECT 1 FROM pg_indexes 
  WHERE indexname = 'idx_game_players_activity'
);
```

Expected result: `true`

## Comprehensive Schema Diagnostics

Before reloading the schema cache, run `database/comprehensive_schema_diagnostic.sql` to identify exactly which columns are missing. This helps you apply only the necessary migrations and verify the fix afterward. See `database/SCHEMA_FIX_GUIDE.md` for a complete workflow.

## When to Reload Schema Cache

Reload the schema cache after:

- ✅ Running any migration that **adds columns** to existing tables
- ✅ Running any migration that **removes columns** from existing tables
- ✅ Running any migration that **adds new tables**
- ✅ Running any migration that **removes tables**
- ⚠️ Running migrations that **modify constraints or indexes** (optional but recommended)
- ✅ When seeing **PGRST204 errors** about missing columns in the console
- ✅ **After running `add_economic_columns.sql` migration** (adds credits, energy, minerals, research_points to players; renames troops to troop_count and adds energy_generation, has_minerals, in_nebula to systems) - **CRITICAL for bot creation and game start functionality**
- ✅ **After running `add_game_players_missing_columns.sql` migration** (renames color to empire_color, adds is_alive, systems_controlled, and stats columns) - **CRITICAL for game creation functionality**
- ✅ **After running `add_difficulty_column.sql` migration** (adds difficulty column to games table) - **CRITICAL for game creation functionality**

You do **NOT** need to reload the cache for:

- ❌ Inserting/updating/deleting rows (data changes)
- ❌ Creating/modifying RLS policies
- ❌ Creating/modifying functions
- ❌ Deploying Edge Functions

## Common Errors Requiring Cache Refresh

### "Could not find the 'difficulty' column of 'games' in the schema cache"

**Cause:** The `add_difficulty_column.sql` migration added the difficulty column but PostgREST hasn't refreshed its schema cache.

**Affected Operations:**
- Creating new games (via `gameService.createGame`)
- Game creation fails immediately with schema cache error
- Prevents all gameplay as games cannot be created

**Solution:**
1. Verify migration was applied: 
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'games' AND column_name = 'difficulty';
   ```
2. If query returns 1 row, reload schema cache via **Method 1: Dashboard Reload** (lines 13-30)
3. If query returns 0 rows, run `database/add_difficulty_column.sql` first, then reload cache
4. Test by creating a new game in browser (should succeed without errors)

**Why this is critical:** PostgREST caches the database schema for performance. After running `add_difficulty_column.sql`, the cache still reflects the old schema without the `difficulty` column. Reloading forces PostgREST to re-scan the database and recognize the new column. Without this step, every attempt to create a game will fail with "Could not find the 'difficulty' column of 'games' in the schema cache" error.

**Verification:** After reloading, create a test game. Console should show "Created game <id> with creator <player_id>" without schema cache errors.

For a comprehensive check of all missing columns, see `database/SCHEMA_FIX_GUIDE.md`.

### "Could not find the 'empire_color' column of 'game_players' in the schema cache"

**Cause**: The `add_game_players_missing_columns.sql` migration added/renamed columns but PostgREST hasn't refreshed its schema cache
**Affected Operations**:
- Creating new games (via `gameService.createGame` at line 56)
- Joining games (via `gameService.joinGame` at line 107)
- Fetching game info (via `gameService.getGameInfo` at line 335)
- Game creation fails immediately with schema cache error
- Prevents all gameplay as games cannot be created
**Solution**:
1. Verify migration was applied: `SELECT column_name FROM information_schema.columns WHERE table_name = 'game_players' AND column_name IN ('empire_color', 'is_alive', 'systems_controlled');` (should return 3 rows)
2. If query returns fewer than 3 rows, run `database/add_game_players_missing_columns.sql` first, then reload cache
3. If query returns 3 rows, reload schema cache via **Method 1: Dashboard Reload** (lines 13-30)
4. Test by creating a new game in browser (should succeed without errors)
**Why this is critical**: PostgREST caches the database schema for performance. After running `add_game_players_missing_columns.sql`, the cache still reflects the old schema with `color` instead of `empire_color`. Reloading forces PostgREST to re-scan the database and recognize the renamed/new columns. Without this step, every attempt to create or join a game will fail with "Could not find the 'empire_color' column of 'game_players' in the schema cache" error.
**Verification**: After reloading, create a test game. Console should show "Created game <id> with creator <player_id>" without schema cache errors. Game should appear in lobby and be joinable.

This is one of several columns that may be missing. Run `database/comprehensive_schema_diagnostic.sql` to check all tables at once.
**Related Errors**: If you see similar errors for `is_alive`, `systems_controlled`, or `is_eliminated` columns, the same solution applies - these columns were all added by the same migration.

### "Could not find the 'credits' column of 'players' in the schema cache"

**Cause:** The `add_economic_columns.sql` migration added new columns but PostgREST hasn't refreshed its schema cache.

**Affected Operations:**
- Creating bot players (via `add_bots_to_game` RPC)
- Starting games (triggers bot creation)
- Generating solar system maps (inserts systems with new columns)
- Deducting troops (references `troop_count` column)

**Solution:**
1. Verify migration was applied: 
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'players' AND column_name = 'credits';
   ```
2. If query returns 1 row, reload schema cache
3. If query returns 0 rows, run `add_economic_columns.sql` first, then reload cache
4. Test by creating a new game and starting it (should add bots without errors)

See `database/SCHEMA_FIX_GUIDE.md` for a complete diagnostic and fix workflow covering all tables.

## Troubleshooting

### "Reload Schema" Button Not Found

**Possible causes:**
- You might be on an older Supabase plan or dashboard version
- The button location may have changed in newer dashboard versions

**Solutions:**
- Check under **Project Settings** → **Database** → **Connection Pooling** (sometimes relocated)
- Use Method 2 (API) instead
- Contact Supabase support for help locating the feature

### Cache Refresh Didn't Fix the Error

If you still see "credits column not found" after reloading cache:

1. **Verify columns actually exist in database:**
   ```sql
   \d players  -- PostgreSQL command to describe table structure
   ```
   - Should show credits, energy, minerals, research_points columns
   - If missing, migration didn't apply successfully

2. **Check for migration errors:**
   - Review Supabase SQL Editor history for failed statements
   - Look for constraint violations or data type mismatches
   - Ensure `IF NOT EXISTS` clauses worked correctly

3. **Force cache clear (advanced):**
   - Restart PostgREST service (contact Supabase support for hosted projects)
   - For local development: `supabase stop && supabase start` 

4. **Verify RLS policies aren't blocking:**
   - Check if service_role can query new columns
   - Test with direct SQL query in Supabase SQL Editor

### Schema Cache Reload Didn't Fix the Error (General)

**Diagnosis:**

1. Verify the migration was actually applied:
   ```sql
   -- Check if columns exist
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'game_players' 
   AND column_name IN ('is_active', 'last_seen');
   ```

2. Check for typos in column names in your client code

3. Clear browser cache and hard refresh (`Ctrl+Shift+R` or `Cmd+Shift+R`)

4. Restart your development server (sometimes Vite/React holds stale connections)

5. Try reloading schema cache a second time (sometimes it takes two attempts)

**If still failing:**
- Check Supabase status page for outages: https://status.supabase.com
- Check project logs for PostgreSQL errors
- Verify your Supabase project isn't paused (free tier auto-pauses after inactivity)

### Errors Returned After Cache Reload

**Symptoms:**
- Different error code (not PGRST204)
- Error about RLS policies
- 401/403 permission denied errors

**Diagnosis:**
These are **different issues** unrelated to schema cache:
- PGRST204 = schema cache issue (column not found in cache)
- 401/403 = authentication/authorization issue (RLS policies)
- PGRST116 = ambiguous column (multiple tables with same column name)

**Solution:**
- For RLS errors, check `database/README.md` troubleshooting section
- For auth errors, verify your API keys and Supabase URL
- For ambiguous columns, use explicit table joins in queries

## Prevention: Deployment Workflow

To prevent PGRST204 errors in production deployments:

### Recommended CI/CD Steps:

1. Apply database migrations via SQL Editor or CLI
2. **Immediately reload schema cache** (don't wait!)
3. Deploy frontend code changes
4. Verify health checks pass
5. Monitor error logs for PGRST204 in first 5 minutes

### Manual Deployment Checklist:

```
[ ] Run migration SQL file in Supabase SQL Editor
[ ] Verify migration success (check for error messages)
[ ] Navigate to Project Settings → API
[ ] Click "Reload Schema" button
[ ] Wait for timestamp to update (2-5 seconds)
[ ] Deploy frontend changes
[ ] Test application end-to-end
[ ] Monitor console for PGRST204 errors
```

## Reference

- **PostgREST Schema Cache Documentation:** https://postgrest.org/en/stable/admin.html#schema-cache
- **Supabase API Documentation:** https://supabase.com/docs/guides/api
- **Related Migrations:** 
  - `database/add_player_activity_tracking.sql`
  - `database/add_economic_columns.sql`
- **Related Documentation:** 
  - `database/README.md` (troubleshooting section for credits/troop_count errors)
  - `database/README.md` (PGRST204 troubleshooting section)

## Quick Reference Commands

```sql
-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'game_players' 
AND column_name IN ('is_active', 'last_seen');

-- Check if index exists
SELECT EXISTS (
  SELECT 1 FROM pg_indexes 
  WHERE indexname = 'idx_game_players_activity'
);

-- Verify migration applied
SELECT * FROM game_players LIMIT 1;
-- Should include is_active and last_seen columns
```

---

**Need help?** Check `database/README.md` for more troubleshooting guidance or consult the Supabase Discord community.

**IMPORTANT:** Never use `supabase db reset --linked` to reload schema cache! That command completely wipes your database and re-applies all migrations from scratch. It's only for development when you need to start fresh, not for schema cache reloading.
