# Stellar Database Setup Guide

This directory contains SQL migrations for setting up your Supabase database with proper security and structure.

## Files

1. **`add_is_public_column.sql`** - Adds public/private game support
2. **`setup_rls_policies.sql`** - Production-ready Row Level Security policies

## Setup Instructions

Run these scripts in your **Supabase SQL Editor** in this order:

### 1. Add Missing Columns

```bash
# Run: add_is_public_column.sql
```

This adds the `is_public` column to support public and private games.

### 2. Configure Row Level Security

```bash
# Run: setup_rls_policies.sql
```

This sets up production-ready security policies following the principle of least privilege.

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
