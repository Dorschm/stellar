# Supabase Edge Function Deployment Guide

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

### 2. Deploy the Edge Function

1.  Run the deploy command:
    ```bash
    supabase functions deploy game-tick
    ```

2.  Wait for the success message. It should display the deployed URL:
    `https://chnccetbqkaqbkekjzbv.supabase.co/functions/v1/game-tick`

### 3. Verify Deployment

1.  Go to **Supabase Dashboard** > **Edge Functions**.
2.  Confirm `game-tick` is listed and status is **Active**.
3.  Check the logs tab for any immediate startup errors.

### 4. Troubleshooting

-   **Login Issues:** If `supabase link` fails with auth errors, run `supabase login` first.
-   **Docker:** The CLI might require Docker to be running for local testing, but usually not for deployment if you are just pushing code.
-   **Secrets:** If the function uses environment variables (like `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), ensure they are set in the Supabase Dashboard > Edge Functions > Secrets, or push your local `.env` file:
    ```bash
    supabase secrets set --env-file .env
    ```
    *(Note: Standard Supabase keys are usually auto-injected).*

### Alternative: Manual Deployment

If the CLI fails, you can manually deploy via the dashboard:
1.  Go to **Edge Functions** > **Create Function**.
2.  Name: `game-tick`.
3.  Copy the content of `supabase/functions/game-tick/index.ts`.
4.  Paste into the web editor.
5.  Click **Deploy**.
