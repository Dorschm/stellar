# Edge Function Deployment Verification

## Step 1: Deploy the Functions
```bash
cd c:/Users/dorsc/Desktop/Stellar
# Deploy both functions
supabase functions deploy game-tick
supabase functions deploy mark-inactive

# Or deploy all functions at once
# supabase functions deploy --all
```

**Note:** Deploy both functions to ensure complete game functionality (tick processing and player activity tracking)

## Step 2: Verify Deployment in Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/chnccetbqkaqbkekjzbv/functions
2. Confirm both `game-tick` and `mark-inactive` appear in the list
3. Verify each function shows 'Active' status with green indicator
4. Check the deployment timestamps are recent (within last few minutes)
5. Click on each function name to view detailed logs and recent invocations

## Step 3: Test CORS from Browser Console
Open your game at http://localhost:3000 and run these tests in the browser console:

### Test game-tick CORS
```javascript
// Test game-tick CORS
const testCors = async (endpoint) => {
  const response = await fetch(`https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/${endpoint}`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization,x-client-info,apikey'
    }
  });
  console.log(`${endpoint} CORS Status:`, response.status);
  console.log(`${endpoint} CORS Headers:`, Object.fromEntries(response.headers.entries()));
  return response;
};

// Test both functions
testCors('game-tick').then(() => testCors('mark-inactive'));
```

**Expected for both functions:**
- Status: 204
- Headers include: 
  - `access-control-allow-origin: *`
  - `access-control-allow-headers` with all required headers
  - `access-control-allow-methods: POST, OPTIONS`

**Troubleshooting:**
- If status is 200 instead of 204, the CORS fix may not be deployed - redeploy the function
- If CORS fails, clear browser cache and hard reload (Ctrl+Shift+R)

## Step 4: Test Function Execution

### Test game-tick Function
```javascript
// Replace YOUR_GAME_ID with actual game ID from the URL
// Copy your anon key from Supabase dashboard (Settings → API) and replace YOUR_SUPABASE_ANON_KEY
fetch('https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/game-tick', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + 'YOUR_SUPABASE_ANON_KEY'
  },
  body: JSON.stringify({ gameId: 'YOUR_GAME_ID' })
}).then(r => r.json()).then(console.log)
```
**Expected:** 
```json
{
  "success": true, 
  "tick": 123,
  "stats": {
    "planetsProcessed": 10,
    "attacksProcessed": 2,
    "sectorsCreated": 5
  }
}
```

**Note:** The tick number is returned as `tick` (not `tickNumber`). For complete tick history and debugging, query the `game_ticks` table directly.

### Step 4.5: Test mark-inactive Function
```javascript
// Test mark-inactive endpoint
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
}).then(r => r.json()).then(console.log)
```
**Expected:** `{ success: true }`

## Step 5: Verify Database Changes

### Check Game Ticks
```sql
-- Check tick increments
SELECT game_id, COUNT(*) as tick_count, 
       MIN(tick_number) as min_tick, 
       MAX(tick_number) as max_tick
FROM game_ticks 
WHERE game_id = 'YOUR_GAME_ID'
GROUP BY game_id;
```
**Expected:** Rows showing incrementing tick numbers

### Check Player Activity
```sql
-- Verify player activity tracking
SELECT player_id, last_active_at, is_active
FROM players
WHERE game_id = 'YOUR_GAME_ID';
```
**Expected:** Timestamps updating with player activity

## Troubleshooting

### Deployment Issues
- **Deployment fails**: 
  - Check Supabase CLI is logged in: `supabase login`
  - Verify project link: `supabase projects list`
  - Check for syntax errors in function code

### CORS Issues
- **CORS fails**:
  - Clear browser cache and hard reload (Ctrl+Shift+R)
  - Verify OPTIONS handler returns 204 status
  - Check `access-control-allow-origin` header includes your origin

### Function Execution
- **Function doesn't execute**:
  - Check Edge Function logs in Supabase dashboard
  - Verify function is deployed and active
  - Check for RLS policy issues in database

### Database Issues
- **Ticks don't increment**:
  - Check RLS policies on `game_ticks` table
  - Verify service role key has necessary permissions
  - Check database connection in function logs

### Multiple Function Deployment
- **One function works, other doesn't**:
  - Deploy functions individually
  - Check each function's logs separately
  - Verify environment variables are set for both functions

### Reference Documentation
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [CORS Configuration](https://supabase.com/docs/guides/functions/cors)
- [Debugging Edge Functions](https://supabase.com/docs/guides/functions/debugging)

### API Contract Maintenance
**Important:** The `game-tick` function response structure documented in Step 4 must be kept in sync with the actual implementation in `supabase/functions/game-tick/index.ts`. Any changes to the response format (field names, nesting, or data types) should be immediately reflected in this documentation to maintain a clear API contract for consumers.
