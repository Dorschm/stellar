# Game Players Migration Guide

## Problem Overview

The application is currently experiencing a **critical schema cache error**: 
`"Could not find the 'empire_color' column of 'game_players' in the schema cache"`

This is caused by a mismatch between the database schema and the application code:
- **Column Mismatches**: Schema has `color`, `eliminated`, `ready` but code expects `empire_color`, `is_eliminated`, `is_ready`.
- **Missing Columns**: Schema is missing `is_alive`, `systems_controlled`, `final_territory_percentage`, `total_troops_sent`, `planets_captured`.

**Impact**: 
- Game creation fails immediately.
- Game start fails.
- Game tick processing fails.
- Victory screen fails.

## Pre-Migration Verification

Before applying the migration, check the current state of your `game_players` table:

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'game_players' 
ORDER BY column_name;
```

**Expected Output (Before Migration)**:
- You should see `color`, `eliminated`, `ready`.
- You should **NOT** see `empire_color`, `is_alive`, `systems_controlled`, etc.

Check if any data exists:
```sql
SELECT COUNT(*) FROM game_players;
```

## Migration Execution Steps

1.  **Open Supabase Dashboard**: Go to the SQL Editor.
2.  **Open Migration File**: Open `database/add_game_players_missing_columns.sql` in your code editor.
3.  **Copy & Paste**: Copy the entire file contents and paste into the Supabase SQL Editor.
4.  **Run**: Click the **Run** button.
5.  **Verify Success**: Ensure you see a success message (e.g., "Success. No rows returned"). If you see "column already exists", the migration is safe to ignore as it is idempotent.

## Schema Cache Reload (CRITICAL!)

**You MUST reload the schema cache after running this migration.** 
If you skip this step, the error `"Could not find the 'empire_color' column..."` will persist.

1.  Navigate to **Project Settings**.
2.  Go to **API**.
3.  Find the **Schema Cache** section.
4.  Click **Reload Schema**.
5.  Wait for the timestamp to update (2-5 seconds).

*Refer to `SUPABASE_SCHEMA_CACHE_REFRESH.md` for more details.*

## Post-Migration Verification

1.  **Check Columns**: Re-run the column check query:
    ```sql
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'game_players' 
    ORDER BY column_name;
    ```
    **Expected Output**: You should now see `empire_color`, `is_eliminated`, `is_ready`, `is_alive`, `systems_controlled`, etc.

2.  **Check Data Integrity**:
    ```sql
    SELECT COUNT(*) FROM game_players WHERE is_alive IS NULL OR systems_controlled IS NULL;
    ```
    **Expected Output**: `0` (All rows should have default values).

3.  **Check Indexes**:
    ```sql
    SELECT indexname FROM pg_indexes WHERE tablename = 'game_players' AND (indexname LIKE '%alive%' OR indexname LIKE '%systems_controlled%');
    ```
    **Expected Output**: Should return 2 rows.

## End-to-End Testing Checklist

1.  **Start Dev Server**: `npm run dev`
2.  **Open Console**: Open browser DevTools (F12).
3.  **Create Game**: Create a new game via the UI.
    - **Success**: Console shows `Created game <id> with creator <player_id>` without schema errors.
4.  **Join Game**: Join as a second player (incognito window).
5.  **Start Game**: Start the game as host.
    - **Success**: Console shows `Game <id> started...`, map generated.
6.  **Verify Gameplay**: Wait 10s.
    - **Success**: No CORS/400 errors in console. Look for `[CLIENT] ✅ Game tick system operational`.

## Troubleshooting

-   **"Column already exists"**: The migration was already applied. This is fine.
-   **Schema cache error persists**: You didn't reload the cache correctly. Try again, and restart your dev server.
-   **Different error**: Check RLS policies (`fix_cors_and_rls_policies.sql` or `fix_game_tick_rls_policies.sql`).
