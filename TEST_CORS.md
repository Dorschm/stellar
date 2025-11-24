# CORS Verification Guide

Follow these steps to verify that CORS is correctly configured for the `game-tick` Edge Function.

## 1. Browser Console Test

Open your game in the browser (`http://localhost:3000` or wherever you are hosting the frontend). Open the Developer Tools (F12), go to the **Console** tab, and paste the following script:

```javascript
async function testGameTickCORS() {
  const baseUrl = 'https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/game-tick';
  
  console.log('🧪 Testing game-tick CORS...');
  
  // Test 1: OPTIONS Preflight
  try {
    console.log('Sending OPTIONS request...');
    const optionsRes = await fetch(baseUrl, { method: 'OPTIONS' });
    console.log('✅ OPTIONS Status:', optionsRes.status);
    console.log('   Access-Control-Allow-Origin:', optionsRes.headers.get('Access-Control-Allow-Origin'));
    console.log('   Access-Control-Allow-Methods:', optionsRes.headers.get('Access-Control-Allow-Methods'));
  } catch (e) {
    console.error('❌ OPTIONS request failed:', e.message);
  }
  
  // Test 2: POST Request (Actual Call)
  try {
    console.log('Sending POST request...');
    const postRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: 'test-connectivity-id' })
    });
    
    const corsHeader = postRes.headers.get('Access-Control-Allow-Origin');
    const data = await postRes.json();
    
    console.log('✅ POST Status:', postRes.status);
    console.log('   Access-Control-Allow-Origin:', corsHeader);
    console.log('   Response Body:', data);

    if (corsHeader === '*') {
        console.log('%c🎉 SUCCESS: CORS headers are present!', 'color: green; font-weight: bold; font-size: 14px;');
    } else {
        console.log('%c❌ FAILURE: CORS header missing or incorrect.', 'color: red; font-weight: bold;');
    }

  } catch (e) {
    console.error('❌ POST request failed:', e.message);
    if (e.message.includes('Failed to fetch')) {
        console.log('%cPossible Causes:', 'color: orange');
        console.log('1. Function not deployed.');
        console.log('2. Wrong URL.');
        console.log('3. CORS preflight failed (check Network tab).');
    }
  }
}

testGameTickCORS();
```

## 2. Network Tab Verification

1.  Open **Developer Tools** > **Network**.
2.  Run the script above.
3.  Look for the `game-tick` request.
4.  Click on it and view the **Headers** tab.
5.  **Response Headers** must contain:
    -   `access-control-allow-origin: *`
    -   `access-control-allow-methods: POST, OPTIONS` (for OPTIONS request)

## 3. Success Criteria

-   [ ] OPTIONS request returns 204.
-   [ ] POST request returns 200 (or 400/404 depending on valid gameId).
-   [ ] No red "CORS error" in the console.
-   [ ] `Access-Control-Allow-Origin: *` is visible in response headers.
