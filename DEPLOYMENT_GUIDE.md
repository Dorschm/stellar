# Supabase Edge Function Deployment Guide

## 0. Environment Configuration

Before deploying Edge Functions, ensure your production environment is configured:

1. **Create Production Environment File**:
   ```bash
   cp .env.example .env.production.local
   ```

2. **Add Production Credentials**:
   - Open `.env.production.local` in your editor
   - Set `VITE_SUPABASE_URL=https://chnccetbqkaqbkekjzbv.supabase.co` 
   - Get anon key from Supabase Dashboard > Settings > API > Project API keys
   - Set `VITE_SUPABASE_ANON_KEY=<your_actual_anon_key>` 

3. **Verify Configuration**:
   - File is gitignored (check `.gitignore` line 94)
   - URL matches production project reference: `chnccetbqkaqbkekjzbv` 
   - Anon key is the `public` role key, not service_role

4. **Test Build**:
   ```bash
   npm run build
   npm run preview
   ```
   - Verify network calls in DevTools go to production Supabase URL
   - See `PRODUCTION_BUILD_GUIDE.md` for detailed verification steps

For more details, see `ENVIRONMENT_SETUP.md`.

## Prerequisites

1.  **Install Supabase CLI**
    Verify installation:
    ```bash
    supabase --version
    ```
    If not installed:
    ```bash
    npm install -g supabase
    ```

2.  **Supabase Account**
    Ensure you have access to the project dashboard at [supabase.com/dashboard](https://supabase.com/dashboard).

## Deployment Steps

### 1. Link Local Project to Supabase

1.  Navigate to your project root directory in the terminal:
    ```bash
    cd c:/Users/dorsc/Desktop/Stellar
    ```

2.  Get your Project Reference ID:
    -   Go to your Supabase Dashboard.
    -   Select your project (`chnccetbqkaqbkekjzbv`).
    -   The reference ID is the string in the URL: `https://supabase.com/dashboard/project/chnccetbqkaqbkekjzbv`.
    -   **Project Ref:** `chnccetbqkaqbkekjzbv`

3.  Link the project:
    ```bash
    supabase link --project-ref chnccetbqkaqbkekjzbv
    ```
    *You will be prompted for your database password.*

### 2. Deploy the Edge Functions

1.  Deploy the game-tick function:
    ```bash
    supabase functions deploy game-tick
    ```
    Wait for the success message. It should display the deployed URL:
    `https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/game-tick`

2.  Deploy the mark-inactive function:
    ```bash
    supabase functions deploy mark-inactive
    ```
    Wait for the success message. It should display the deployed URL:
    `https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/mark-inactive`

**Deploying Multiple Functions**: You can deploy all functions at once using the `--all` flag:
```bash
supabase functions deploy --all
```

### 3. Verify Deployment

1.  Go to **Supabase Dashboard** > **Edge Functions**.
2.  Confirm both `game-tick` and `mark-inactive` are listed with status **Active**.
3.  Check the logs tab for each function for any immediate startup errors.
4.  Verify the deployment timestamps are recent (within the last few minutes).

### 4. Post-Deployment Verification

After successful deployment, perform these checks:

1. **Function Status**:
   - Both `game-tick` and `mark-inactive` functions should appear in the Supabase dashboard with "Active" status
   - Deployment timestamps should be recent (within last few minutes)
   - Review Edge Function logs for any startup errors or warnings

2. **Function URLs**:
   - Game Tick: `https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/game-tick`
   - Mark Inactive: `https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/mark-inactive`

3. **CORS Testing**:
   - Refer to `EDGE_FUNCTION_DEPLOYMENT.md` for detailed CORS testing procedures
   - Test both functions to ensure they handle OPTIONS requests correctly (should return 204 status)

4. **Function Execution**:
   - Test both functions with actual payloads to verify they process requests as expected
   - Check database tables for expected changes (e.g., `game_ticks` for the game-tick function)

### 5. Troubleshooting

-   **Login Issues:** If `supabase link` fails with auth errors, run `supabase login` first.
-   **Docker:** The CLI might require Docker to be running for local testing, but usually not for deployment if you are just pushing code.
-   **Secrets:** If the function uses custom environment variables, ensure they are set in the Supabase Dashboard > Edge Functions > Secrets, or push your local `.env` file:
    ```bash
    supabase secrets set --env-file .env
    ```
    *(Note: Standard Supabase keys like `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected by Supabase for Edge Functions and typically don't need manual configuration.)*

### Alternative: Manual Deployment

If the CLI fails, you can manually deploy via the dashboard:
1.  Go to **Edge Functions** > **Create Function**.
2.  Name: `game-tick`.
3.  Copy the content of `supabase/functions/game-tick/index.ts`.
4.  Paste into the web editor.
5.  Click **Deploy**.

## cPanel Deployment

### Prerequisites

- Production environment configured (`.env.production.local` with correct Supabase credentials)
- Build tested locally (`npm run build` && `npm run preview`)
- Edge Functions deployed to Supabase
- Database migrations applied

### Deployment Methods

- **Automatic (Git Version Control)**: Push to cPanel Git repository triggers `.cpanel.yml` auto-deployment
- **Manual**: Build locally, zip `dist/`, upload to cPanel File Manager, extract to `~/public_html/app/` 

### Automatic Deployment Steps

- Commit changes to Git repository
- Push to cPanel Git remote (configured in cPanel > Git Version Control)
- cPanel executes `.cpanel.yml` tasks automatically:
  - Installs dependencies (`npm ci`)
  - Builds production bundle (`npm run build`)
  - Removes legacy app subdirectory (`rm -rf ~/public_html/app`)
  - Creates dedicated app directory (`mkdir -p ~/public_html/app`)
  - Syncs `dist/` to `~/public_html/app/` (dedicated subdirectory)
- Monitor deployment logs in cPanel > Git Version Control interface

### Manual Deployment Steps

- Run `npm run build` locally
- Verify `dist/` directory size (~2-5 MB)
- Create zip archive: `zip -r stellar-build.zip dist/` 
- Upload to cPanel via File Manager
- Extract to `~/public_html/app/` (overwrite existing files)
- Delete old `~/public_html/stellar/` subdirectory if exists

### Post-Deployment Verification

- Visit https://stellar.game/app/ (dedicated subdirectory, not root domain)
- Check browser console for Supabase initialization
- Create test game to verify functionality
- Monitor Edge Function logs in Supabase dashboard
- Clear browser cache if assets don't load

### Troubleshooting

- **404 errors**: Check `.cpanel.yml` rsync destination is `~/public_html/app/` (not `~/public_html/` or `~/public_html/stellar/`)
- **Old version loads**: Clear cPanel cache, browser cache, and check deployment timestamp
- **Build fails**: Check cPanel error logs, verify Node.js version compatibility
- **Assets 404**: Verify `vite.config.ts` has `base: '/app/'` (not `base: '/'` or `base: '/stellar/'`)

Reference `.cpanel.yml` for exact deployment commands and `PRODUCTION_BUILD_GUIDE.md` for build verification steps.
