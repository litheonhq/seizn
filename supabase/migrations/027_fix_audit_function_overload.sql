-- Fix log_audit_event function overload issue
-- The function was defined in 009 with 9 params and redefined in 016 with 14 params
-- PostgreSQL created two overloads, causing ambiguity when calling with default params

-- Drop all overloaded versions first
DO $$
DECLARE
    func_record RECORD;
BEGIN
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

-- Recreate unified function with all parameters having defaults
CREATE FUNCTION log_audit_event(
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

-- Recreate the audit triggers that depend on this function

-- API Keys audit trigger
CREATE OR REPLACE FUNCTION audit_api_key_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_event(
      NEW.user_id, NULL, NEW.id,
      'api_key.create', 'api_key', NEW.id,
      jsonb_build_object('name', NEW.name, 'scopes', NEW.scopes),
      NULL,
      jsonb_build_object('is_active', NEW.is_active)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN
      PERFORM log_audit_event(
        NEW.user_id, NULL, NEW.id,
        'api_key.revoke', 'api_key', NEW.id,
        jsonb_build_object('name', NEW.name),
        jsonb_build_object('is_active', OLD.is_active),
        jsonb_build_object('is_active', NEW.is_active)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS api_key_audit_trigger ON api_keys;
CREATE TRIGGER api_key_audit_trigger
  AFTER INSERT OR UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION audit_api_key_changes();

-- Verify
SELECT p.oid::regprocedure AS function_signature
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'log_audit_event';
