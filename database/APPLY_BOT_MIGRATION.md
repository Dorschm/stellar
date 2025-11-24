# Apply Bot Migration Guide

## References
- `database/add_bot_players.sql`

This guide provides instructions for applying the `add_bot_players.sql` migration to Supabase. This migration creates the necessary functions for bot players, including `add_bots_to_game`, which is required for game creation.

## Step-by-Step Instructions

### 1. Via Supabase Dashboard (Recommended)

1.  Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2.  Select your project.
3.  Navigate to the **SQL Editor** (icon on the left sidebar).
4.  Click **New Query**.
5.  Copy the entire contents of the file `database/add_bot_players.sql` from your local project.
6.  Paste the content into the SQL Editor in the dashboard.
7.  Click the **Run** button (bottom right of the editor) to execute the SQL.
8.  Verify that you see a success message indicating the query ran successfully.

### 2. Via Supabase CLI (Alternative)

If you have the Supabase CLI installed and your project linked:

1.  Open a terminal in your project root.
2.  Run the following command to apply the migration file directly:
    ```bash
    supabase db push
    ```
    *Note: This assumes you are using the standard Supabase migration workflow.*

3.  Alternatively, you can execute the file directly against your remote database:
    ```bash
    psql <your-connection-string> -f database/add_bot_players.sql
    ```

### 3. Verification Steps

After applying the migration, verify that the functions exist:

1.  In the Supabase SQL Editor, run the following query:
    ```sql
    SELECT * FROM pg_proc WHERE proname = 'add_bots_to_game';
    ```
    You should see one row returned with the function definition.

2.  Verify the helper function exists:
    ```sql
    SELECT * FROM pg_proc WHERE proname = 'create_bot_player';
    ```

3.  Verify the name generator exists:
    ```sql
    SELECT * FROM pg_proc WHERE proname = 'generate_random_bot_name';
    ```

### 4. Test Bot Creation

1.  Open your application in the browser.
2.  Try creating a new game and ensure you select to include bots.
3.  The "Could not find the function" error should no longer appear.
4.  Check the `players` table to verify bots are added with `is_bot = true`.
5.  Check the `game_players` table to verify bots are added with `is_ready = true`.

## Troubleshooting

-   **Connection Errors**: Ensure your internet connection is stable and Supabase services are operational.
-   **Permission Denied**: Ensure the user running the SQL has sufficient privileges (postgres role usually).
-   **Function Already Exists**: If you get an error that the function already exists, the migration uses `CREATE OR REPLACE FUNCTION`, so this shouldn't be an issue unless there's a signature mismatch. In that case, you might need to `DROP FUNCTION` first.
