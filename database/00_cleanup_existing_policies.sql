-- Cleanup script - Run this FIRST to remove any existing policies
-- This prevents conflicts when applying new policies
-- This will drop ALL policies on ALL your game tables

-- Universal cleanup for ALL tables
DO $$ 
DECLARE
    r RECORD;
    table_list text[] := ARRAY['players', 'games', 'game_players', 'systems', 'fleets', 
                                'structures', 'trade_routes', 'combat_logs', 'alliances'];
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY table_list
    LOOP
        -- Check if table exists
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = tbl) THEN
            -- Drop all policies on this table
            FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = tbl) LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, tbl);
                RAISE NOTICE 'Dropped policy % on table %', r.policyname, tbl;
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- Verification: List remaining policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('players', 'games', 'game_players', 'systems', 'fleets', 'structures')
ORDER BY tablename, policyname;

-- If the above query returns no rows, you're ready to run setup_rls_policies.sql
