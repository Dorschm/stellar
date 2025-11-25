# Environment Configuration Guide

## Overview

This project uses Vite's built-in environment variable system to manage Supabase credentials across different deployment environments. Vite automatically loads environment files based on the current mode (`development` vs `production`) and follows a specific priority order.

## File Priority

Vite loads environment files in the following order (higher priority files override lower priority ones):

1. `.env.production.local` - Production-specific variables (highest priority)
2. `.env.production` - Production variables
3. `.env.local` - Local variables (all modes)
4. `.env` - Default variables (lowest priority)

**Note**: Files with `.local` suffix are excluded from version control via `.gitignore`.

## Development Setup

For local development, create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your development Supabase credentials:
- Get credentials from Supabase Dashboard > Settings > API
- Use your development project URL and anon key
- The file should contain `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## Production Setup

For production deployment to https://stellar.game:

1. **Create Production Environment File**:
   ```bash
   cp .env.example .env.production.local
   ```

2. **Add Production Credentials**:
   - Open `.env.production.local` in your editor
   - Set `VITE_SUPABASE_URL=https://chnccetbqkaqbkekjzbv.supabase.co`
   - Get anon key from Supabase Dashboard > Settings > API > Project API keys > `anon` `public`
   - Set `VITE_SUPABASE_ANON_KEY=<your_actual_anon_key>`

3. **Verify Configuration**:
   - Confirm file is gitignored (check `.gitignore` line 94 and `*.local` pattern on line 13)
   - URL matches production project reference: `chnccetbqkaqbkekjzbv`
   - Anon key is the `public` role key, not service_role

## Security Best Practices

- **Never commit** `.env.production.local`, `.env.local`, or `.env` files to version control
- **Only commit** `.env.example` with placeholder values
- **Rotate keys** immediately if accidentally exposed
- **Use different projects** for development and production environments
- **Limit access** to production credentials to authorized team members only

## Verification

To verify that your build uses production URLs:

1. Build the project: `npm run build`
2. Inspect bundled JavaScript files:
   ```bash
   grep -r "chnccetbqkaqbkekjzbv" dist/assets/
   ```
3. Verify no localhost URLs in build:
   ```bash
   grep -r "localhost" dist/assets/
   ```
4. Test locally: `npm run preview` and check browser DevTools Network tab

## Troubleshooting

### Common Issues

**Missing Environment Variables**
- Error: `undefined` Supabase client
- Solution: Verify `.env.production.local` exists and contains required variables

**Wrong URLs in Build**
- Error: API calls going to localhost instead of production
- Solution: Check environment file priority, ensure `.env.production.local` is being loaded

**CORS Errors**
- Error: Cross-origin requests blocked
- Solution: Ensure Edge Functions are deployed with proper CORS headers

**Build Failures**
- Error: TypeScript compilation errors
- Solution: Fix type errors before building, check `tsc` output

### Debug Steps

1. Check environment file exists: `ls -la .env*`
2. Verify build process: `npm run build` should complete without errors
3. Inspect build output: Check `dist/assets/*.js` for correct Supabase URL
4. Test locally: `npm run preview` and monitor browser console
5. Check network requests: Verify API calls go to production Supabase URL

## Reference

- [Vite Environment Variables Documentation](https://vitejs.dev/guide/env-and-mode)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Project Documentation](README.md)

## Next Steps

After configuring environment variables:

1. Deploy Edge Functions (see `EDGE_FUNCTION_DEPLOYMENT.md`)
2. Build and test production version (see `PRODUCTION_BUILD_GUIDE.md`)
3. Deploy to production (see `DEPLOYMENT_GUIDE.md`)
