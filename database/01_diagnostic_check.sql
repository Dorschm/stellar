-- Diagnostic script to check current RLS status and policies
-- Run this to see what's currently configured

-- Check if RLS is enabled on tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('players', 'games', 'game_players', 'systems', 'fleets', 'structures')
ORDER BY tablename;

-- Check all existing policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename IN ('players', 'games', 'game_players', 'systems', 'fleets', 'structures')
ORDER BY tablename, policyname;

-- Check if anon role has access (this is the default Supabase role)
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('players', 'games', 'game_players', 'systems')
    AND grantee = 'anon'
ORDER BY table_name, privilege_type;

-- Test simple select query (should work if policies are correct)
-- This will return an error if there's a permission issue
SELECT COUNT(*) as total_games FROM games;
