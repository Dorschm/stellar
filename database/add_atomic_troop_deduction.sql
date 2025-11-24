-- =====================================================
-- MIGRATION: Atomic Troop Deduction RPC Function
-- =====================================================
-- This migration adds an RPC function for atomic server-side
-- troop deduction to prevent race conditions from concurrent updates.
--
-- This function is designed to be called by backend services using
-- service_role to ensure proper game state management. It requires
-- the calling service to provide the player_id explicitly.
-- =====================================================

-- Drop existing function and permissions if they exist
DROP FUNCTION IF EXISTS deduct_troops(UUID, UUID, INTEGER) CASCADE;

-- Function to atomically deduct troops from a system
-- Prevents race conditions from concurrent updates by using database-side arithmetic
CREATE OR REPLACE FUNCTION deduct_troops(
  p_system_id UUID,
  p_player_id UUID,
  p_troop_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER -- Run with caller's permissions to enforce RLS
AS $$
DECLARE
  v_current_troops INTEGER;
  v_new_troops INTEGER;
  v_player_id UUID;
  v_game_id UUID;
  v_has_access BOOLEAN;
BEGIN
  -- Verify player has access to the system
  SELECT 
    s.game_id,
    EXISTS (
      SELECT 1 
      FROM game_players gp 
      WHERE gp.game_id = s.game_id 
      AND gp.player_id = p_player_id
      AND gp.is_active = true
    )
  INTO v_game_id, v_has_access
  FROM systems s
  WHERE s.id = p_system_id;
  
  -- Check if system exists and player has access
  IF v_game_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'system_not_found',
      'message', 'System not found or access denied'
    );
  END IF;
  
  IF NOT v_has_access THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'access_denied',
      'message', 'You do not have permission to modify this system'
    );
  END IF;
  
  -- Lock the row and get current troop count
  SELECT troop_count INTO v_current_troops
  FROM systems
  WHERE id = p_system_id
  FOR UPDATE;
  
  -- Check if sufficient troops
  IF v_current_troops < p_troop_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_troops',
      'message', 'Insufficient troops available',
      'current_troops', v_current_troops,
      'requested', p_troop_count
    );
  END IF;
  
  -- Perform atomic decrement
  UPDATE systems
  SET 
    troop_count = troop_count - p_troop_count,
    updated_at = now()
  WHERE id = p_system_id
  RETURNING troop_count INTO v_new_troops;
  
  -- Log the troop deduction
  INSERT INTO game_audit_log (
    game_id,
    player_id,
    action_type,
    target_type,
    target_id,
    details
  ) VALUES (
    v_game_id,
    p_player_id,
    'troop_deduction',
    'system',
    p_system_id,
    jsonb_build_object(
      'troops_deducted', p_troop_count,
      'previous_count', v_current_troops,
      'new_count', v_new_troops
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'old_troops', v_current_troops,
    'deducted', p_troop_count,
    'new_troops', v_new_troops,
    'game_id', v_game_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'server_error',
      'message', 'Failed to process troop deduction: ' || SQLERRM
    );
END;
$$;

-- Revoke all permissions first to ensure clean state
REVOKE ALL ON FUNCTION deduct_troops(UUID, UUID, INTEGER) FROM PUBLIC;

-- Only allow execution by service role
GRANT EXECUTE ON FUNCTION deduct_troops(UUID, UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION deduct_troops IS 'Backend-only function to atomically deduct troops from a system. ' ||
  'Requires service_role and explicit player_id parameter. Validates player access to the target system ' ||
  'and includes audit logging for all troop deductions. Should only be called by backend services.';
