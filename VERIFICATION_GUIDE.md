# Game Tick System Verification Guide

References:
- src\components\Game.tsx
- supabase\functions\game-tick\index.ts
- database\README.md
- database\fix_game_tick_rls_policies.sql
- database\fix_cors_and_rls_policies.sql
- package.json
- .env.example
- README.md

This comprehensive verification guide provides step-by-step instructions for testing the game tick system after applying CORS and RLS fixes.

## 1. Prerequisites Section
- Verify `.env` file exists with valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (reference `.env.example` for format)
- Confirm all dependencies are installed (`npm install`)
- Ensure database migrations have been applied (specifically `database/fix_game_tick_rls_policies.sql` and `database/fix_cors_and_rls_policies.sql`)
- Note that Supabase project URL should match the one in console logs: `https://chnccetbqkaqbkekjzbv.supabase.co`

## 2. Step 1: Start Development Server
- Command: `npm run dev`
- Expected output: Server starts on `http://localhost:3000`
- Open browser and navigate to `http://localhost:3000/`
- Open browser DevTools Console (F12 → Console tab)

## 3. Step 2: Create a New Game
- Click through the start screen to create a game
- Enter a username when prompted
- Create or join a game lobby
- Start the game (if host) or wait for host to start
- Game should transition from lobby to active 3D view

## 4. Step 3: Monitor Browser Console for Success Messages
- **Critical Success Indicator** (appears within 1-2 seconds of game start):
  - Look for: `[CLIENT] ✅ Game tick system operational. CORS and RLS policies working correctly.`
  - Source: `src/components/Game.tsx` around line 458
  - This message confirms the first successful tick response from the Edge Function
  - If you see this, CORS is fixed and Edge Function is responding ✅

- **Tick Trigger Confirmations** (every 10 ticks = ~1 second):
  - Look for: `[HOST] Triggering game tick #10 for game <game-id> at <timestamp>`
  - Source: `src/components/Game.tsx` around line 409
  - Confirms client is invoking the Edge Function every 100ms

- **Tick Number Updates** (should increment continuously):
  - Look for: `[CLIENT] Subscription tick update: 0 -> 1`, `[CLIENT] Subscription tick update: 1 -> 2`, etc.
  - Source: `src/components/Game.tsx` line 646
  - Confirms database `game_ticks` table is being updated by Edge Function
  - Tick number should increment roughly every 100ms (10 ticks per second)

- **No CORS Errors** (absence of these is good):
  - Should NOT see: `Access to fetch at '...game-tick' has been blocked by CORS policy`
  - Should NOT see: `No 'Access-Control-Allow-Origin' header is present`
  - If you see these, the CORS fix in `supabase/functions/game-tick/index.ts` was not applied correctly

- **No RLS Policy Errors** (absence of these is good):
  - Should NOT see: `[CLIENT] RLS POLICY ERROR: Database policies may be blocking access`
  - Should NOT see: 406 or 400 status errors on `game_ticks` queries
  - If you see these, run `database/fix_game_tick_rls_policies.sql` migration

## 5. Step 4: Verify game_ticks Table is Incrementing
- Open Supabase Dashboard → SQL Editor
- Run this query (replace `<game-id>` with your actual game ID from console logs):
  ```sql
  SELECT game_id, tick_number, last_tick_at 
  FROM game_ticks 
  WHERE game_id = '<game-id>' 
  ORDER BY last_tick_at DESC 
  LIMIT 1;
  ```
- **Expected Result:**
  - One row returned with incrementing `tick_number` (should be in the hundreds or thousands after a few seconds)
  - `last_tick_at` timestamp should be very recent (within last few seconds)
- **If No Rows:**
  - Edge Function is not inserting/updating the table
  - Check Edge Function logs (Step 6)
  - Verify RLS policies allow `service_role` to INSERT/UPDATE (run `database/fix_game_tick_rls_policies.sql`)
- **If Tick Number Stuck at 0 or Low Number:**
  - Edge Function may be failing silently
  - Check Edge Function logs for errors
  - Verify game status is 'active' (not 'waiting' or 'completed')

## 6. Step 5: Check Supabase Edge Function Logs
- Go to Supabase Dashboard → Edge Functions → `game-tick` → Logs tab
- **Success Indicators:**
  - Look for: `[TICK] Handler invoked for gameId: <game-id>`
  - Look for: `[TICK] Successfully updated tick to <N> for game <game-id>`
  - Look for: `[TICK] Processing <N> arriving attacks at tick <N>`
  - `[TICK] Attack <id> retreating: <troops> troops vs <defenders> defenders (threshold: <threshold>)` every 100ms (very frequent)
  - No error messages or stack traces
- **Error Indicators:**
  - `[TICK] ERROR: Failed to increment tick:` → RLS policy blocking service_role or other database error
  - `RLS policy violation` or `permission denied` → Run `database/fix_game_tick_rls_policies.sql`
  - `CORS` errors → Should not appear in Edge Function logs (CORS is client-side)
  - Any uncaught exceptions or stack traces → Report the error
- **If No Logs Appear:**
  - Edge Function is not being invoked
  - Check browser console for invocation errors
  - Verify Edge Function is deployed (Dashboard → Edge Functions → should show 'game-tick' as deployed)
  - Check that `VITE_SUPABASE_URL` in `.env` matches your Supabase project URL

## 7. Step 6: Test Game Mechanics
- **Troop Growth:**
  - Select a planet you own (click on it)
  - Watch the troop count in the HUD
  - Troops should increment every few seconds (based on game tick processing)
  - Source: `supabase/functions/game-tick/index.ts` lines 451-505 (troop generation logic)

- **Attack Processing:**
  - Select a planet you own with troops
  - Click "Send 50%" to attack a nearby planet
  - You should see an animated attack line (moving sphere) from source to target
  - Console should log: `[ATTACK] Creating attack:` and `[ATTACK] Mapped attack:`
  - After arrival time, attack should resolve (troops transfer or retreat)
  - Source: `supabase/functions/game-tick/index.ts` lines 506-885 (combat resolution)

- **Territory Expansion:**
  - After owning a planet for ~10 ticks (1 second), colored sectors should appear around it
  - Sectors expand progressively in waves (OpenFront-style)
  - Console should log: `[TERRITORY] Fetched <N> sectors from database`
  - Enable debug mode in HUD (click "🔍 Territory Debug") to see expansion stats
  - Source: `supabase/functions/game-tick/index.ts` lines 886-1115 (territory expansion logic)

- **Resource Generation:**
  - Check HUD for resource counters (credits, energy, minerals, research)
  - Resources should increment over time based on owned planets
  - Source: `supabase/functions/game-tick/index.ts` lines 1337-1442 (resource generation)

## 8. Step 7: Verify No Errors in Console
- Review entire browser console output
- **Acceptable Messages:**
  - `[CLIENT]`, `[ATTACK]`, `[TERRITORY]`, `[GAME PRESENCE]` prefixed logs
  - Info/debug messages about game state
- **Unacceptable Errors:**
  - Any red error messages about CORS, RLS, or failed requests
  - 400, 406, 500 status codes on API requests
  - `Failed to load resource` errors (except for expected 3D model loading)
  - `FunctionsFetchError` messages
- If you see errors, cross-reference with troubleshooting section in `database/README.md`

## 9. Success Criteria Summary
- ✅ Browser console shows `[CLIENT] ✅ Game tick system operational`
- ✅ Tick number increments continuously (visible in console logs)
- ✅ `game_ticks` table in database shows incrementing tick_number
- ✅ No CORS errors in browser console
- ✅ No RLS policy errors (400/406 status codes)
- ✅ Supabase Edge Function logs show successful tick processing
- ✅ Troops grow on owned planets
- ✅ Attacks animate and resolve correctly
- ✅ Territory sectors expand around owned planets
- ✅ Resources increment over time

## 10. Troubleshooting Quick Reference
- **CORS Errors:** Verify `supabase/functions/game-tick/index.ts` OPTIONS handler includes `status: 204` (lines 246-254)
- **RLS Errors:** Run `database/fix_game_tick_rls_policies.sql` and `database/fix_cors_and_rls_policies.sql` migrations
- **Tick Not Incrementing:** Check Edge Function logs for errors, verify game status is 'active'
- **No Edge Function Logs:** Verify function is deployed, check `.env` file has correct Supabase URL
- **Attacks Not Creating:** Run `database/fix_planet_attacks_rls.sql` migration
- **Structures Not Visible:** Run `database/fix_cors_and_rls_policies.sql` and call `set_player_context` RPC before queries
- **Detailed Troubleshooting:** See `database/README.md` sections on "Troubleshooting" and "Game ticks not processing"

## 11. Additional Verification Queries
- **Check all active games:**
  ```sql
  SELECT id, name, status, created_at 
  FROM games 
  WHERE status = 'active' 
  ORDER BY created_at DESC 
  LIMIT 5;
  ```

- **Check player activity in game:**
  ```sql
  SELECT player_id, is_active, last_seen, placement_order 
  FROM game_players 
  WHERE game_id = '<game-id>' 
  ORDER BY placement_order;
  ```

- **Check territory sector count:**
  ```sql
  SELECT owner_id, COUNT(*) as sector_count 
  FROM territory_sectors 
  WHERE game_id = '<game-id>' 
  GROUP BY owner_id;
  ```

- **Check recent attacks:**
  ```sql
  SELECT id, status, troops, arrival_at 
  FROM planet_attacks 
  WHERE game_id = '<game-id>' 
  ORDER BY created_at DESC 
  LIMIT 5;
  ```

## 12. Performance Benchmarks
- Tick processing should complete in < 50ms (check Edge Function logs)
- Client should receive tick updates within 1 second (polling interval)
- Attack animations should be smooth (60 FPS)
- Territory rendering should not cause frame drops
- If performance is poor, check for excessive logging or database query optimization needs

### Schema Cache Error: "Could not find the 'difficulty' column"

**Symptoms:**
- Game creation fails with error: "Could not find the 'difficulty' column of 'games' in the schema cache"
- Error occurs immediately when clicking "Create Game" button
- Console shows 400 or PGRST204 errors

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

**Reference:** See `SUPABASE_SCHEMA_CACHE_REFRESH.md` for detailed cache reload instructions

**References:**
- Main game component: `src/components/Game.tsx`
- Edge Function: `supabase/functions/game-tick/index.ts`
- Database setup: `database/README.md`
- RLS fixes: `database/fix_game_tick_rls_policies.sql`, `database/fix_cors_and_rls_policies.sql`
- Project README: `README.md`
