# Missing Columns Migration Checklist

This checklist ensures all required columns exist in the `games` table before attempting to create games.

## Problem

For a comprehensive step-by-step guide covering all tables, see `SCHEMA_FIX_GUIDE.md`.

The application code expects these columns in the `games` table:
- ✅ `name` (exists in base schema)
- ✅ `status` (exists in base schema)
- ✅ `max_players` (exists in base schema)
- ❌ `victory_condition` (missing - needs migration)
- ❌ `tick_rate` (missing - needs migration)
- ❌ `difficulty` (missing - needs migration)
- ⚠️ `is_public` (may be missing - check first)

## Step-by-Step Fix

### Step 1: Verify Current Schema

For a comprehensive check of all tables, use `comprehensive_schema_diagnostic.sql` which checks games, game_players, systems, and players tables in one query.

Run this query in Supabase SQL Editor to check which columns exist:

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'games' 
AND column_name IN ('victory_condition', 'tick_rate', 'difficulty', 'is_public')
ORDER BY column_name;
```

**Expected Result**: 4 rows (one for each column)
**If Missing**: Note which columns are missing and proceed to Step 2

### Step 2: Apply Missing Migrations

Run these migrations **in order** in Supabase SQL Editor:

#### 2a. Add is_public column (if missing)
```bash
File: database/add_is_public_column.sql
```
- Copy entire file contents
- Paste into Supabase SQL Editor
- Click **Run**
- Verify success message

#### 2b. Add difficulty column (if missing)
```bash
File: database/add_difficulty_column.sql
```
- Copy entire file contents
- Paste into Supabase SQL Editor
- Click **Run**
- Verify success message

#### 2c. Add tick_rate column (if missing)
```bash
File: database/add_tick_rate_column.sql
```
- Copy entire file contents
- Paste into Supabase SQL Editor
- Click **Run**
- Verify success message

#### 2d. Add victory_condition column (if missing)
```bash
File: database/add_victory_condition_column.sql
```
- Copy entire file contents
- Paste into Supabase SQL Editor
- Click **Run**
- Verify success message

If diagnostic shows missing columns in `players` or `systems` tables (credits, energy, troop_count, etc.), also run `add_economic_columns.sql`

### Step 3: Reload PostgREST Schema Cache (CRITICAL!)

**This step is MANDATORY after running migrations!**

**Recommended Method**: Use the Supabase Dashboard to reload the schema cache:
1. Navigate to **Project Settings** → **API** in your Supabase Dashboard
2. Scroll to the **Schema Cache** section
3. Click **Reload Schema** button
4. Wait for confirmation and verify timestamp updates

For complete instructions and alternative methods, see: **[SUPABASE_SCHEMA_CACHE_REFRESH.md](../SUPABASE_SCHEMA_CACHE_REFRESH.md)**

**Why This Matters**: PostgREST caches the database schema. Even though the columns now exist in PostgreSQL, PostgREST won't know about them until you reload the cache. Skipping this step means game creation will still fail.

### Step 4: Verify All Columns Exist

Re-run the verification query from Step 1:

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'games' 
AND column_name IN ('victory_condition', 'tick_rate', 'difficulty', 'is_public')
ORDER BY column_name;
```

**Expected Result**: 4 rows showing:
- `difficulty | text | 'normal'::text` 
- `is_public | boolean | false` 
- `tick_rate | integer | 100` 
- `victory_condition | integer | 80` 

### Step 5: Test Game Creation

1. Open your application in the browser
2. Open DevTools Console (F12)
3. Click **Create Game** button
4. Fill in game details
5. Submit the form

**Success Indicators**:
- ✅ No schema cache errors in console
- ✅ Console shows: `Created game <id> with creator <player_id>` 
- ✅ Game appears in lobby
- ✅ Can start the game and add bots

**If Still Failing**:
- Check browser console for exact error message
- Verify schema cache timestamp updated (Step 3)
- Try reloading schema cache a second time
- Clear browser cache and hard refresh (Ctrl+Shift+R)

## Quick Reference: All Required Columns

| Column | Type | Default | Migration File | Purpose |
|--------|------|---------|----------------|----------|
| `name` | TEXT | - | Base schema | Game name |
| `status` | TEXT | 'waiting' | Base schema | Game state |
| `max_players` | INTEGER | 4 | Base schema | Player limit |
| `victory_condition` | INTEGER | 80 | `add_victory_condition_column.sql` | Win threshold (%) |
| `tick_rate` | INTEGER | 100 | `add_tick_rate_column.sql` | Update interval (ms) |
| `difficulty` | TEXT | 'normal' | `add_difficulty_column.sql` | Bot AI difficulty |
| `is_public` | BOOLEAN | false | `add_is_public_column.sql` | Public lobby visibility |

## Troubleshooting

### "Column already exists" Error

**Cause**: Migration was already applied
**Solution**: Skip that migration and proceed to the next one

### Schema Cache Reload Didn't Fix Error

**Diagnosis**:
1. Verify columns exist in database (Step 4 query)
2. Check schema cache timestamp actually updated
3. Try reloading cache a second time
4. Restart your development server
5. Clear browser cache

### Different Error After Migrations

**If you see RLS policy errors**: Run `database/fix_cors_and_rls_policies.sql` 
**If you see tick processing errors**: Run `database/fix_game_tick_rls_policies.sql` 
**If you see bot creation errors**: Run `database/add_bot_players.sql` and reload schema cache

For a comprehensive check of all missing columns, run `database/comprehensive_schema_diagnostic.sql` and follow `database/SCHEMA_FIX_GUIDE.md`.

## Related Documentation

- `SUPABASE_SCHEMA_CACHE_REFRESH.md` - Detailed schema cache reload instructions
- `database/README.md` - Full database setup and troubleshooting guide
- `VERIFICATION_GUIDE.md` - End-to-end testing guide
