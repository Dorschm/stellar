-- ============================================================================
-- STRUCTURES RLS SECURITY VERIFICATION SCRIPT
-- ============================================================================
-- This script verifies that the structures table RLS policies are correctly
-- configured according to the security requirements.
--
-- NOTE: This script does NOT modify any policies. It only verifies that the
--       policies defined in fix_cors_and_rls_policies.sql are correctly applied.
-- ============================================================================

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

DO $$
DECLARE
    v_policy_count INTEGER;
    v_expected_policies TEXT[] := ARRAY[
        'structures_select_policy',
        'structures_insert_policy',
        'structures_update_policy',
        'structures_delete_policy'
    ];
    v_missing_policies TEXT[] := '{}';
    v_policy TEXT;
    v_function_exists BOOLEAN;
    v_grants_ok BOOLEAN := TRUE;
    v_grant RECORD;
    v_required_grants TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    v_missing_grants TEXT[] := '{}';
    v_grant_type TEXT;
BEGIN
    -- Verify all required policies exist
    RAISE NOTICE '🔍 Verifying RLS policies on structures table...';
    
    SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
    WHERE tablename = 'structures';
    
    IF v_policy_count = 0 THEN
        RAISE EXCEPTION '❌ No RLS policies found on structures table. Run fix_cors_and_rls_policies.sql first.';
    END IF;
    
    -- Check for each expected policy
    FOREACH v_policy IN ARRAY v_expected_policies LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'structures' 
            AND policyname = v_policy
        ) THEN
            v_missing_policies := v_missing_policies || v_policy;
        END IF;
    END LOOP;
    
    -- Check set_player_context function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'set_player_context' 
        AND pronargs = 1
    ) INTO v_function_exists;
    
    -- Check required grants
    FOREACH v_grant_type IN ARRAY v_required_grants LOOP
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.role_table_grants
            WHERE table_name = 'structures'
            AND privilege_type = v_grant_type
            AND grantee = 'anon'
        ) THEN
            v_missing_grants := v_missing_grants || ('anon:' || v_grant_type);
            v_grants_ok := FALSE;
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.role_table_grants
            WHERE table_name = 'structures'
            AND privilege_type = v_grant_type
            AND grantee = 'authenticated'
        ) THEN
            v_missing_grants := v_missing_grants || ('authenticated:' || v_grant_type);
            v_grants_ok := FALSE;
        END IF;
    END LOOP;
    
    -- Check function execute grants
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.role_routine_grants
        WHERE routine_name = 'set_player_context'
        AND grantee = 'anon'
        AND privilege_type = 'EXECUTE'
    ) THEN
        v_missing_grants := v_missing_grants || 'anon:EXECUTE';
        v_grants_ok := FALSE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.role_routine_grants
        WHERE routine_name = 'set_player_context'
        AND grantee = 'authenticated'
        AND privilege_type = 'EXECUTE'
    ) THEN
        v_missing_grants := v_missing_grants || 'authenticated:EXECUTE';
        v_grants_ok := FALSE;
    END IF;
    
    -- Report results
    IF array_length(v_missing_policies, 1) > 0 THEN
        RAISE WARNING '❌ Missing RLS policies: %', array_to_string(v_missing_policies, ', ');
        RAISE EXCEPTION '❌ Please run fix_cors_and_rls_policies.sql to apply the required RLS policies.';
    ELSIF NOT v_function_exists THEN
        RAISE EXCEPTION '❌ Required function set_player_context is missing. Run fix_cors_and_rls_policies.sql first.';
    ELSIF NOT v_grants_ok THEN
        RAISE WARNING '❌ Missing grants: %', array_to_string(v_missing_grants, ', ');
        RAISE EXCEPTION '❌ Required grants are missing. Run fix_cors_and_rls_policies.sql first.';
    ELSE
        RAISE NOTICE '✅ All required RLS policies and permissions are correctly configured.';
        RAISE NOTICE '   - Found % expected policies', array_length(v_expected_policies, 1);
        RAISE NOTICE '   - Required function set_player_context exists';
        RAISE NOTICE '   - All required grants are in place';
        RAISE NOTICE '\n💡 Next steps:';
        RAISE NOTICE '1. Ensure client code calls set_player_context before querying structures';
        RAISE NOTICE '   Example: await supabase.rpc(''set_player_context'', { player_id: currentPlayer.id })';
        RAISE NOTICE '2. Test that RLS policies are working as expected';
    END IF;
END $$;

-- ============================================================================
-- CURRENT POLICY DETAILS (for reference)
-- ============================================================================

SELECT 
    p.policyname,
    p.cmd,
    p.roles,
    p.qual as filter_condition,
    p.with_check as with_check_expression,
    pg_catalog.obj_description(('r' || r.oid)::regclass::oid, 'pg_class') as table_comment,
    d.description as policy_comment
FROM 
    pg_policies p
    LEFT JOIN pg_class r ON r.relname = p.tablename
    LEFT JOIN pg_namespace n ON n.oid = r.relnamespace
    LEFT JOIN pg_description d ON d.objoid = (n.nspname || '.' || p.policyname)::regclass
WHERE 
    p.tablename = 'structures'
    AND n.nspname = 'public'
ORDER BY 
    p.policyname;
