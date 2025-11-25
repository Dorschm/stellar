# Edge Function Deployment Checklist

This checklist ensures both Edge Functions (`game-tick` and `mark-inactive`) are properly deployed with CORS fixes.

## Pre-Deployment Checks

- [ ] **Supabase CLI**
  - [ ] `supabase --version` shows latest version
  - [ ] `supabase login` completed successfully
  - [ ] Project linked with `supabase link --project-ref chnccetbqkaqbkekjzbv`

- [ ] **Code Review**
  - [ ] CORS fixes verified in both functions (OPTIONS handlers return status: 204)
  - [ ] Database migrations applied (RLS policies, schema changes)
  - [ ] Local testing completed (game creation, ticks, no CORS errors)

- [ ] **Environment**
  - [ ] `.env` file with required variables
  - [ ] Supabase project environment variables set
  - [ ] Database connection tested

## Deployment Steps

- [ ] **Deploy Functions**
  ```bash
  cd c:/Users/dorsc/Desktop/Stellar
  supabase functions deploy game-tick
  supabase functions deploy mark-inactive
  ```
  - [ ] Both deployments completed successfully
  - [ ] Note deployment timestamps

- [ ] **Verify in Dashboard**
  - [ ] Open [Supabase Dashboard](https://supabase.com/dashboard/project/chnccetbqkaqbkekjzbv/functions)
  - [ ] Both functions show "Active" status
  - [ ] Check logs for startup errors
  - [ ] Verify deployment timestamps match recent deployment

## Post-Deployment Testing

- [ ] **CORS Testing**
  - [ ] Run CORS tests from browser console (see `EDGE_FUNCTION_DEPLOYMENT.md` Step 3)
  - [ ] Confirm 204 status for OPTIONS requests
  - [ ] Verify CORS headers are present and correct

- [ ] **Function Testing**
  - [ ] Test `game-tick` function execution
    ```javascript
    // Copy your anon key from Supabase dashboard (Settings → API) and replace YOUR_SUPABASE_ANON_KEY
    fetch('https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/game-tick', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + 'YOUR_SUPABASE_ANON_KEY'
      },
      body: JSON.stringify({ gameId: 'YOUR_GAME_ID' })
    })
    ```
    - [ ] Verify response: `{ success: true, tickNumber: N }`

  - [ ] Test `mark-inactive` function execution
    ```javascript
    // Copy your anon key from Supabase dashboard (Settings → API) and replace YOUR_SUPABASE_ANON_KEY
    fetch('https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/mark-inactive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + 'YOUR_SUPABASE_ANON_KEY'
      },
      body: JSON.stringify({ 
        gameId: 'YOUR_GAME_ID',
        playerId: 'YOUR_PLAYER_ID'
      })
    })
    ```
    - [ ] Verify response: `{ success: true }`

- [ ] **Database Verification**
  ```sql
  -- Check tick increments
  SELECT game_id, COUNT(*) as tick_count, 
         MIN(tick_number) as min_tick, 
         MAX(tick_number) as max_tick
  FROM game_ticks 
  WHERE game_id = 'YOUR_GAME_ID'
  GROUP BY game_id;
  ```
  - [ ] Verify tick numbers incrementing

  ```sql
  -- Check player activity
  SELECT player_id, last_active_at, is_active
  FROM players
  WHERE game_id = 'YOUR_GAME_ID';
  ```
  - [ ] Verify timestamps updating

## Production Testing

- [ ] **Game Testing**
  - [ ] Create new game in production
  - [ ] Monitor browser console for errors
  - [ ] Verify tick system operational message: `[CLIENT] ✅ Game tick system operational`
  - [ ] Confirm troops growing
  - [ ] Test player activity (leave/rejoin game)

- [ ] **Monitoring**
  - [ ] Check Supabase logs for function invocations
  - [ ] Monitor database metrics for unusual activity
  - [ ] Verify no error emails/alerts

## Rollback Plan

- [ ] **If deployment fails**
  - [ ] Note current working version/commit
  - [ ] Revert code changes: `git checkout <previous-commit>`
  - [ ] Redeploy: 
    ```bash
    supabase functions deploy game-tick
    supabase functions deploy mark-inactive
    ```
  - [ ] Verify rollback successful

## Reference Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Detailed deployment instructions
- [EDGE_FUNCTION_DEPLOYMENT.md](./EDGE_FUNCTION_DEPLOYMENT.md) - Testing procedures
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [CORS Configuration](https://supabase.com/docs/guides/functions/cors)
