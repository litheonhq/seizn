-- Fix log_audit_event function overload issue
-- Drop all overloaded versions and keep only one

-- First, find and drop all versions of the function
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Find all overloaded versions
    FOR func_record IN
        SELECT p.oid::regprocedure AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'log_audit_event'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropped: %', func_record.func_signature;
    END LOOP;
END;
$$;

-- Recreate the function with the latest signature (including is_service_role)
CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id TEXT,
  p_organization_id UUID DEFAULT NULL,
  p_api_key_id UUID DEFAULT NULL,
  p_action VARCHAR(50) DEFAULT NULL,
  p_resource_type VARCHAR(50) DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}',
  p_previous_state JSONB DEFAULT NULL,
  p_new_state JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL,
  p_is_service_role BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    user_id, organization_id, api_key_id,
    action, resource_type, resource_id,
    details, previous_state, new_state,
    ip_address, user_agent, status, error_message,
    is_service_role
  ) VALUES (
    p_user_id, p_organization_id, p_api_key_id,
    p_action, p_resource_type, p_resource_id,
    p_details, p_previous_state, p_new_state,
    p_ip_address, p_user_agent, p_status, p_error_message,
    p_is_service_role
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT p.oid::regprocedure AS function_signature
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'log_audit_event';
