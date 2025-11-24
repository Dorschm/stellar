# Structures RLS Security Fixes

## Issues Identified

### 1. **SELECT Policy Too Permissive**
The original `structures_select_policy` only verified that *any* player existed in the game, not that the *current* player was participating. This allowed any client to see all structures in all games.

**Before:**
```sql
USING (
    EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = structures.game_id
        AND game_players.player_id IN (
            SELECT player_id FROM game_players WHERE game_id = structures.game_id
        )
    )
)
```

**After:**
```sql
USING (
    EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = structures.game_id
        AND game_players.player_id = current_setting('app.player_id', true)::uuid
    )
)
```

### 2. **Write Policies Didn't Verify Current Player**
The INSERT/UPDATE/DELETE policies only checked if `owner_id` existed in `game_players`, but didn't verify that the *current* player was the owner. This allowed any player to create/modify/delete structures on behalf of other players.

**Before (INSERT example):**
```sql
WITH CHECK (
    EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = structures.game_id
        AND game_players.player_id = structures.owner_id
    )
)
```

**After:**
```sql
WITH CHECK (
    structures.owner_id = current_setting('app.player_id', true)::uuid
    AND EXISTS (
        SELECT 1 FROM game_players
        WHERE game_players.game_id = structures.game_id
        AND game_players.player_id = current_setting('app.player_id', true)::uuid
    )
)
```

## Changes Made

### 1. **Updated RLS Policies**
- ✅ `structures_select_policy` - Now requires current player to be in the game
- ✅ `structures_insert_policy` - Now requires current player to match owner_id
- ✅ `structures_update_policy` - Now requires current player to match owner_id
- ✅ `structures_delete_policy` - Now requires current player to match owner_id

### 2. **Added Helper Function**
Created `set_player_context(player_id uuid)` function to set the session variable used by RLS policies:
```sql
CREATE OR REPLACE FUNCTION set_player_context(player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.player_id', player_id::text, false);
END;
$$;
```

### 3. **Added Proper Grants**
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON structures TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON structures TO authenticated;
GRANT EXECUTE ON FUNCTION set_player_context(uuid) TO anon;
GRANT EXECUTE ON FUNCTION set_player_context(uuid) TO authenticated;
```

### 4. **Added Documentation**
- Updated README.md with `set_player_context` requirement
- Added troubleshooting section for structures RLS issues
- Added COMMENT statements on policies explaining the security model

## Application Integration Required

The client application **must** call `set_player_context` before querying structures:

```typescript
// Example: In game initialization or player selection
const currentPlayer = useGameStore(state => state.currentPlayer);

// Set player context once per session or when player changes
await supabase.rpc('set_player_context', { player_id: currentPlayer.id });

// Now all structure queries will use this player context for RLS
const { data: structures } = await supabase
  .from('structures')
  .select('*')
  .eq('game_id', gameId);
```

## Migration Steps

1. **Run the updated migration** (`fix_cors_and_rls_policies.sql`)
2. **Verify policies are correct:**
   ```sql
   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'structures';
   ```
3. **Test with player context:**
   ```sql
   -- Set context for player A
   SELECT set_player_context('player-a-uuid'::uuid);
   SELECT * FROM structures; -- Should only see player A's game structures
   
   -- Try to insert as different owner (should fail)
   INSERT INTO structures (game_id, system_id, owner_id, structure_type)
   VALUES ('game-uuid', 'system-uuid', 'player-b-uuid', 'trade_station');
   -- ERROR: new row violates row-level security policy
   ```

## Security Model

After these fixes:
- ✅ Players can only **view** structures in games they participate in
- ✅ Players can only **create** structures they own (owner_id = current player)
- ✅ Players can only **update** structures they own
- ✅ Players can only **delete** structures they own
- ✅ Service role can perform all operations (for server-side game logic)

This matches the same secure pattern used for `planet_attacks` and other anonymous gameplay tables.
