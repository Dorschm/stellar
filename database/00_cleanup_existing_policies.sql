-- Cleanup script - Run this FIRST to remove any existing policies
-- This prevents conflicts when applying new policies

-- Drop all existing policies on players table
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'players') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON players';
    END LOOP;
END $$;

-- Drop all existing policies on games table
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'games') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON games';
    END LOOP;
END $$;

-- Drop all existing policies on game_players table
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'game_players') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON game_players';
    END LOOP;
END $$;

-- Drop all existing policies on systems table
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'systems') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON systems';
    END LOOP;
END $$;

-- Drop all existing policies on fleets table (if exists)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fleets') THEN
        FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'fleets') LOOP
            EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON fleets';
        END LOOP;
    END IF;
END $$;

-- Drop all existing policies on structures table (if exists)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'structures') THEN
        FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'structures') LOOP
            EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON structures';
        END LOOP;
    END IF;
END $$;

-- Verification: List remaining policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('players', 'games', 'game_players', 'systems', 'fleets', 'structures')
ORDER BY tablename, policyname;

-- If the above query returns no rows, you're ready to run setup_rls_policies.sql
