# Production Build Guide

## Purpose

This guide ensures production builds use correct environment variables and function properly before deployment to https://stellar.game.

## Prerequisites

- `.env.production.local` must exist with production credentials
- Node modules installed (`npm ci` or `npm install`)
- Supabase Edge Functions deployed (reference `EDGE_FUNCTION_DEPLOYMENT.md`)
- Database migrations applied (reference `database/MIGRATION_CHECKLIST.md`)

## Build Process

1. **Run Build Command**:
   ```bash
   npm run build
   ```
   - This executes `tsc && vite build`
   - TypeScript compilation must succeed with no errors
   - Vite build outputs to `dist/` directory

2. **Expected Output**:
   - `dist/index.html` - Main HTML file
   - `dist/assets/*.js` - Bundled JavaScript files
   - `dist/assets/*.css` - Bundled CSS files
   - Total directory size should be ~2-5 MB

## Build Verification

1. **Check Build Directory**:
   ```bash
   ls -la dist/
   ```
   - Verify all expected files are present
   - Check directory size is reasonable (2-5 MB)

2. **Inspect Production URLs**:
   ```bash
   grep -r "chnccetbqkaqbkekjzbv" dist/assets/
   ```
   - Should find the production Supabase URL in bundled JavaScript
   - Confirms environment variables are correctly embedded

3. **Verify No Localhost URLs**:
   ```bash
   grep -r "localhost" dist/assets/
   ```
   - Should return nothing (no localhost references in production build)
   - If found, check environment file configuration

## Local Production Testing

1. **Start Preview Server**:
   ```bash
   npm run preview
   ```
   - Opens at `http://localhost:4173/app/` (matching production https://stellar.game/app/)
   - Serves the production build locally for testing

2. **Functional Testing**:
   - Test game creation flow
   - Test joining existing games
   - Test starting games
   - Verify all game mechanics work correctly

3. **Browser DevTools Verification**:
   - Open DevTools > Network tab
   - Verify API calls go to `https://chnccetbqkaqbkekjzbv.supabase.co`
   - Check console for `[SUPABASE] Client initialized for anonymous gameplay`
   - Confirm no CORS errors
   - Confirm no 400/406 HTTP errors

## Edge Function Testing

1. **Game Tick System**:
   - Check console for `[CLIENT] ✅ Game tick system operational`
   - Verify game ticks increment automatically
   - Monitor real-time updates in the game interface

2. **Supabase Dashboard Monitoring**:
   - Navigate to Supabase Dashboard > Edge Functions > Logs
   - Check `game-tick` function execution logs
   - Check `mark-inactive` function execution logs
   - Verify no error messages or timeouts

3. **Database Operations**:
   - Verify game state updates are persisted
   - Check player actions are recorded correctly
   - Confirm territory control updates work

## Troubleshooting

### Build Failures

**TypeScript Compilation Errors**:
- Check `tsc` output for specific error messages
- Fix type errors before building
- Ensure all imports are correctly typed

**Missing Dependencies**:
- Run `npm ci` to ensure correct dependency versions
- Check `package.json` for missing dependencies
- Verify Node.js version compatibility

**Environment Variable Issues**:
- Verify `.env.production.local` exists
- Check file permissions and location
- Confirm variable names match `VITE_*` prefix

### Runtime Issues

**Wrong URLs in Build**:
- Verify `.env.production.local` has correct values
- Check environment file priority order
- Rebuild after fixing environment files

**CORS Errors**:
- Ensure Edge Functions deployed with CORS fixes
- Check `supabase/functions/game-tick/index.ts` CORS headers
- Check `supabase/functions/mark-inactive/index.ts` CORS headers

**400/406 HTTP Errors**:
- Run database migrations from `database/` directory
- Refresh Supabase schema cache
- Verify database table structures

**Edge Function Failures**:
- Check Supabase Dashboard > Edge Functions > Logs
- Verify function deployment succeeded
- Ensure proper environment variables in Edge Functions

### Debug Commands

```bash
# Check environment files
ls -la .env*

# Verify build contents
grep -r "chnccetbqkaqbkekjzbv" dist/assets/
grep -r "localhost" dist/assets/

# Test build locally
npm run build
npm run preview

# Check TypeScript compilation
tsc --noEmit
```

## Performance Verification

1. **Bundle Size Analysis**:
   - Check individual file sizes in `dist/assets/`
   - Largest files should be under 1 MB
   - Total bundle should be under 5 MB

2. **Load Time Testing**:
   - Use browser DevTools > Network tab
   - Check initial load time with production URLs
   - Verify asset caching headers are present

3. **Memory Usage**:
   - Monitor browser memory usage during gameplay
   - Check for memory leaks in long-running sessions
   - Verify cleanup functions work correctly

## Security Verification

1. **Credential Exposure**:
   - Search for hardcoded credentials in `dist/` files
   - Verify no service_role keys are exposed
   - Check that only anon keys are present

2. **API Security**:
   - Verify Row Level Security (RLS) policies are active
   - Test unauthorized access attempts
   - Check for sensitive data exposure

## Next Steps

After successful build verification:

1. **Deploy to Production**: Use cPanel Git Version Control (push triggers `.cpanel.yml`) or manual upload (see `DEPLOYMENT_GUIDE.md` > cPanel Deployment section)
2. **Monitor Performance**: Set up production monitoring
3. **Test End-to-End**: Verify complete user workflows
4. **Document Issues**: Record any problems and solutions

### cPanel Deployment Quick Reference

- **Automatic**: `git push cpanel main` (if Git remote configured)
- **Manual**: `npm run build` → zip `dist/` → upload to cPanel → extract to `~/public_html/app/` 
- **Verify**: Visit https://stellar.game/app/ (dedicated subdirectory)
- **Cleanup**: Remove old `~/public_html/stellar/` subdirectory if exists
- **Cache**: Clear browser cache and cPanel cache if needed

## Related Documentation

- `ENVIRONMENT_SETUP.md` - Environment configuration
- `EDGE_FUNCTION_DEPLOYMENT.md` - Edge Function deployment
- `DEPLOYMENT_GUIDE.md` - Full deployment process
- `database/MIGRATION_CHECKLIST.md` - Database setup
