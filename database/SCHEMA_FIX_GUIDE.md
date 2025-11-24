# Schema Cache & Missing Column Fix Guide

## 1. Quick Start (TL;DR)

If you are seeing errors like "Could not find the 'difficulty' column of 'games' in the schema cache", it means your database schema is out of sync with the application code. This happens when migrations haven't been applied or the PostgREST schema cache hasn't been reloaded.

**Solution:** Run the [diagnostic script](#2-run-diagnostic), apply recommended migrations, and **RELOAD THE SCHEMA CACHE**.

## 2. Run Diagnostic

Run the `database/comprehensive_schema_diagnostic.sql` script in the Supabase SQL Editor to check all critical tables at once.

1. Open Supabase Dashboard -> SQL Editor
2. Copy/paste contents of `database/comprehensive_schema_diagnostic.sql`
3. Click "Run"

**Interpret Results:**
- Look at the `status` column:
  - ✅ = Column exists (Good)
  - ❌ = Column missing (Needs Fix)
- Look at the second result set for specific "MISSING COLUMN ... -> Run ..." recommendations.

## 3. Apply Migrations (Ordered)

Based on the diagnostic output, run the following migrations in order. If a migration fails saying "column already exists", it's safe to skip it.

### Step 3a: Fix 'games' Table
If `games` table columns are missing (difficulty, tick_rate, victory_condition), run:

1. `database/add_is_public_column.sql` (if 'is_public' missing)
2. `database/add_difficulty_column.sql`
3. `database/add_tick_rate_column.sql`
4. `database/add_victory_condition_column.sql`

### Step 3b: Fix 'game_players' Table
If `game_players` table columns are missing (empire_color, is_alive, etc.), run:

1. `database/add_game_players_missing_columns.sql`

**Verify:** Run `SELECT * FROM game_players LIMIT 1;` - should succeed.

### Step 3c: Fix 'players' and 'systems' Tables
If `players` (credits, energy) or `systems` (troop_count) columns are missing, run:

1. `database/add_economic_columns.sql`
2. `database/add_bot_players.sql` (if 'is_bot' missing)
3. `database/fix_bot_functions.sql` (if 'bot_difficulty' missing)

## 4. Reload Schema Cache (CRITICAL)

**DO NOT SKIP THIS STEP.** Migrations will not be visible to the API until you reload the cache.

1. Go to **Supabase Dashboard** -> **Settings** (cog icon) -> **API**
2. Under "PostgREST Config", click the **Reload** button (circular arrow)
3. Wait for the "Success" toast notification

See `SUPABASE_SCHEMA_CACHE_REFRESH.md` for more details.

## 5. Verify Fix

1. Re-run `database/comprehensive_schema_diagnostic.sql`
2. Ensure all columns now show ✅
3. Test creating a game in the browser
4. Check browser console - you should see "Created game..." without schema cache errors

## 6. Troubleshooting

- **"Still seeing schema cache errors after reload"**: Try reloading a second time. Clear your browser cache. Restart your local dev server (`npm run dev`).
- **"Migration says column already exists"**: The migration was already applied. Verify with the diagnostic script.
- **"Different error after migrations"**: See `database/README.md` troubleshooting section.
- **"Game creation still fails"**: Check the browser console for the exact error message. It might be an RLS policy issue (see `database/setup_rls_policies.sql`).

## 7. Prevention

- Always reload the schema cache after running any SQL that changes table structure (ALTER TABLE, CREATE FUNCTION, etc.).
- Run migrations in the documented order.
- Use the diagnostic script to verify the state of your database before and after changes.
