# Stellar Database Setup Guide

This directory contains SQL migrations for setting up your Supabase database with proper security and structure.

## Files (Run in Order)

1. **`00_cleanup_existing_policies.sql`** - Removes conflicting policies
2. **`01_diagnostic_check.sql`** - Verifies current setup
3. **`add_is_public_column.sql`** - Adds public/private game support
4. **`setup_rls_policies.sql`** - Production-ready Row Level Security policies

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

### Performance issues
- Check if indexes were created
- Run `EXPLAIN ANALYZE` on slow queries
- Consider adding more specific indexes

## Reference

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Policy Documentation](https://www.postgresql.org/docs/current/sql-createpolicy.html)
