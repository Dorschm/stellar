# Edge Function Deployment Verification

## Step 1: Deploy the Function
```bash
cd c:/Users/dorsc/Desktop/Stellar
supabase functions deploy game-tick
```

## Step 2: Verify Deployment in Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/chnccetbqkaqbkekjzbv/functions
2. Confirm `game-tick` appears in the list
3. Check the deployment timestamp is recent
4. View logs to see if function is receiving requests

## Step 3: Test CORS from Browser Console
Open your game at http://localhost:3000 and run this in the browser console:
```javascript
fetch('https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/game-tick', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost:3000',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,authorization,x-client-info,apikey'
  }
}).then(r => {
  console.log('CORS Preflight Status:', r.status)
  console.log('CORS Headers:', Object.fromEntries(r.headers.entries()))
})
```
Expected: Status 204, headers include `access-control-allow-headers` with `x-client-info` 

## Step 4: Test Actual Tick Execution
```javascript
// Replace YOUR_GAME_ID with actual game ID from the URL
fetch('https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/game-tick', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + import.meta.env.VITE_SUPABASE_ANON_KEY
  },
  body: JSON.stringify({ gameId: 'YOUR_GAME_ID' })
}).then(r => r.json()).then(console.log)
```
Expected: Response with `success: true` and tick data

## Step 5: Check Database for Ticks
Run in Supabase SQL Editor:
```sql
SELECT * FROM game_ticks WHERE game_id = 'YOUR_GAME_ID';
```
Expected: At least one row with incrementing tick_number

## Troubleshooting
- If deployment fails: Check Supabase CLI is logged in (`supabase login`)
- If CORS still fails: Clear browser cache and hard reload (Ctrl+Shift+R)
- If function doesn't execute: Check Edge Function logs in Supabase dashboard for errors
- If ticks don't increment: Check database RLS policies allow INSERT/UPDATE on game_ticks table
