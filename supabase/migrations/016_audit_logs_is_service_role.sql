-- Add is_service_role column to audit_logs table
-- This column indicates if the action was performed using service role credentials

ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS is_service_role BOOLEAN DEFAULT FALSE;

-- Add index for filtering service role actions
CREATE INDEX IF NOT EXISTS idx_audit_logs_service_role
ON audit_logs(is_service_role)
WHERE is_service_role = true;

-- Update the log_audit_event function to include is_service_role parameter
CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id TEXT,
  p_organization_id UUID,
  p_api_key_id UUID,
  p_action VARCHAR(50),
  p_resource_type VARCHAR(50),
  p_resource_id UUID,
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

COMMENT ON COLUMN audit_logs.is_service_role IS 'Whether the action was performed using service role credentials';
