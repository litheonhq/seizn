-- Audit Log System for Seizn
-- Tracks important events for compliance and debugging

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who
  user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,

  -- What
  action VARCHAR(50) NOT NULL,  -- e.g., 'memory.create', 'api_key.create', 'member.invite'
  resource_type VARCHAR(50) NOT NULL,  -- e.g., 'memory', 'api_key', 'webhook'
  resource_id UUID,

  -- Details
  details JSONB DEFAULT '{}',  -- Action-specific data
  previous_state JSONB,  -- For updates, the state before change
  new_state JSONB,  -- For updates, the state after change

  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(64),

  -- Result
  status VARCHAR(20) NOT NULL DEFAULT 'success',  -- success, failed, denied
  error_message TEXT,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "Users can view own audit logs"
  ON audit_logs FOR SELECT
  USING (user_id = auth.uid()::text);

-- Org admins can view org audit logs
CREATE POLICY "Admins can view org audit logs"
  ON audit_logs FOR SELECT
  USING (
    organization_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = audit_logs.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Function to log an audit event
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
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    user_id, organization_id, api_key_id,
    action, resource_type, resource_id,
    details, previous_state, new_state,
    ip_address, user_agent, status, error_message
  ) VALUES (
    p_user_id, p_organization_id, p_api_key_id,
    p_action, p_resource_type, p_resource_id,
    p_details, p_previous_state, p_new_state,
    p_ip_address, p_user_agent, p_status, p_error_message
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Automatic audit triggers for important tables

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

-- Webhook audit trigger
CREATE OR REPLACE FUNCTION audit_webhook_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_event(
      NEW.user_id, NEW.organization_id, NULL,
      'webhook.create', 'webhook', NEW.id,
      jsonb_build_object('name', NEW.name, 'url', NEW.url, 'events', NEW.events)
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_event(
      OLD.user_id, OLD.organization_id, NULL,
      'webhook.delete', 'webhook', OLD.id,
      jsonb_build_object('name', OLD.name)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS webhook_audit_trigger ON webhooks;
CREATE TRIGGER webhook_audit_trigger
  AFTER INSERT OR DELETE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION audit_webhook_changes();

-- Organization member audit trigger
CREATE OR REPLACE FUNCTION audit_org_member_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_event(
      NEW.user_id, NEW.organization_id, NULL,
      'member.join', 'organization_member', NEW.id,
      jsonb_build_object('role', NEW.role, 'invited_by', NEW.invited_by)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      PERFORM log_audit_event(
        NEW.user_id, NEW.organization_id, NULL,
        'member.role_change', 'organization_member', NEW.id,
        NULL,
        jsonb_build_object('role', OLD.role),
        jsonb_build_object('role', NEW.role)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_event(
      OLD.user_id, OLD.organization_id, NULL,
      'member.remove', 'organization_member', OLD.id,
      jsonb_build_object('role', OLD.role)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS org_member_audit_trigger ON organization_members;
CREATE TRIGGER org_member_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION audit_org_member_changes();

-- Comments
COMMENT ON TABLE audit_logs IS 'Audit trail for compliance and debugging';
COMMENT ON FUNCTION log_audit_event IS 'Helper function to create audit log entries';
