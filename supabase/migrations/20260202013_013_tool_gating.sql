-- Migration: 20260202_013_tool_gating.sql
-- Description: Agent Tool-Gating Hardening (OWASP Excessive Agency mitigation)
-- Implements capability-based tool tokens and human-in-the-loop workflows
-- Created: 2026-02-02

-- #############################################
-- PART 1: Tool definitions and capabilities
-- #############################################

-- Tool registry
CREATE TABLE IF NOT EXISTS agent_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'read', 'write', 'execute', 'admin', 'external'

  -- Risk classification
  risk_level TEXT NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approval_timeout_seconds INTEGER DEFAULT 300, -- 5 minutes default

  -- Capabilities
  capabilities JSONB NOT NULL DEFAULT '[]'::JSONB, -- ['file:read', 'api:call', etc.]
  required_scopes TEXT[] NOT NULL DEFAULT '{}',

  -- Rate limiting
  default_rate_limit INTEGER, -- calls per minute
  default_daily_limit INTEGER, -- calls per day

  -- Schema validation
  input_schema JSONB, -- JSON Schema for input validation
  output_schema JSONB, -- JSON Schema for output validation

  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_tools_category ON agent_tools(category);
CREATE INDEX IF NOT EXISTS idx_agent_tools_risk ON agent_tools(risk_level);
CREATE INDEX IF NOT EXISTS idx_agent_tools_active ON agent_tools(is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE agent_tools IS 'Registry of available agent tools with risk classification';
COMMENT ON COLUMN agent_tools.risk_level IS 'low=safe read, medium=limited write, high=destructive, critical=admin/external';
COMMENT ON COLUMN agent_tools.requires_approval IS 'If true, requires human approval before execution';

-- #############################################
-- PART 2: Tool tokens (capability-based)
-- #############################################

CREATE TABLE IF NOT EXISTS agent_tool_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID, -- Optional project scope

  -- Token identity
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 of the actual token
  token_prefix TEXT NOT NULL, -- First 8 chars for identification

  -- Allowed tools and capabilities
  allowed_tools UUID[] NOT NULL DEFAULT '{}', -- References agent_tools.id
  allowed_capabilities TEXT[] NOT NULL DEFAULT '{}', -- Explicit capability list
  denied_tools UUID[] NOT NULL DEFAULT '{}', -- Explicit denials

  -- Constraints
  max_risk_level TEXT NOT NULL DEFAULT 'medium', -- Maximum allowed risk level
  require_approval_for UUID[] DEFAULT '{}', -- Tool IDs that require approval

  -- Rate limits (override defaults)
  rate_limit_per_minute INTEGER,
  daily_limit INTEGER,

  -- Validity
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tool_tokens_org ON agent_tool_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_tool_tokens_project ON agent_tool_tokens(project_id);
CREATE INDEX IF NOT EXISTS idx_tool_tokens_hash ON agent_tool_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tool_tokens_active ON agent_tool_tokens(is_active, expires_at);

-- RLS
ALTER TABLE agent_tool_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage tool tokens"
  ON agent_tool_tokens FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE agent_tool_tokens IS 'Capability-based tokens for agent tool access';

-- #############################################
-- PART 3: Approval workflow
-- #############################################

CREATE TABLE IF NOT EXISTS agent_tool_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Request context
  token_id UUID NOT NULL REFERENCES agent_tool_tokens(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
  session_id UUID, -- Agent session
  conversation_id UUID, -- Optional conversation reference

  -- Request details
  request_payload JSONB NOT NULL,
  request_context JSONB, -- Additional context for approver
  reason TEXT, -- Why approval is needed

  -- Approval status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'denied', 'expired', 'auto_approved'
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,

  -- Timing
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Execution (if approved)
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  execution_error TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_approvals_org ON agent_tool_approvals(organization_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON agent_tool_approvals(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approvals_token ON agent_tool_approvals(token_id);
CREATE INDEX IF NOT EXISTS idx_approvals_expires ON agent_tool_approvals(expires_at) WHERE status = 'pending';

-- RLS
ALTER TABLE agent_tool_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view approvals"
  ON agent_tool_approvals FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Org admins can manage approvals"
  ON agent_tool_approvals FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE agent_tool_approvals IS 'Human-in-the-loop approval requests for high-risk tool operations';

-- #############################################
-- PART 4: Tool execution audit log
-- #############################################

CREATE TABLE IF NOT EXISTS agent_tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Execution context
  token_id UUID REFERENCES agent_tool_tokens(id),
  tool_id UUID NOT NULL REFERENCES agent_tools(id),
  approval_id UUID REFERENCES agent_tool_approvals(id),
  session_id UUID,
  conversation_id UUID,

  -- Request
  input_payload JSONB NOT NULL,
  input_hash TEXT, -- For deduplication

  -- Response
  output_payload JSONB,
  output_truncated BOOLEAN DEFAULT false,

  -- Status
  status TEXT NOT NULL, -- 'success', 'error', 'denied', 'timeout', 'rate_limited'
  error_message TEXT,
  error_code TEXT,

  -- Performance
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Rate limiting tracking
  rate_limit_remaining INTEGER,
  daily_limit_remaining INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_executions_org ON agent_tool_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_executions_token ON agent_tool_executions(token_id);
CREATE INDEX IF NOT EXISTS idx_executions_tool ON agent_tool_executions(tool_id);
CREATE INDEX IF NOT EXISTS idx_executions_time ON agent_tool_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_executions_status ON agent_tool_executions(status);

-- Partitioning hint (for large deployments)
COMMENT ON TABLE agent_tool_executions IS 'Audit log of all tool executions. Consider partitioning by started_at for large deployments.';

-- #############################################
-- PART 5: Tool gating policies
-- #############################################

CREATE TABLE IF NOT EXISTS agent_tool_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Policy rules (OPA/Rego compatible)
  rules JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Conditions
  applies_to_tools UUID[] DEFAULT '{}', -- Empty = all tools
  applies_to_risk_levels TEXT[] DEFAULT '{}', -- Empty = all levels

  -- Actions
  action TEXT NOT NULL DEFAULT 'require_approval', -- 'allow', 'deny', 'require_approval', 'rate_limit'
  action_config JSONB DEFAULT '{}'::JSONB,

  -- Priority (lower = higher priority)
  priority INTEGER NOT NULL DEFAULT 100,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tool_policies_org ON agent_tool_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_tool_policies_active ON agent_tool_policies(is_active, priority);

-- RLS
ALTER TABLE agent_tool_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage tool policies"
  ON agent_tool_policies FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE agent_tool_policies IS 'Organization-level policies for tool gating';

-- #############################################
-- PART 6: Functions
-- #############################################

-- Check if tool execution is allowed
CREATE OR REPLACE FUNCTION check_tool_permission(
  p_token_id UUID,
  p_tool_id UUID,
  p_input JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token agent_tool_tokens;
  v_tool agent_tools;
  v_result JSONB;
  v_requires_approval BOOLEAN;
  v_rate_limited BOOLEAN;
BEGIN
  -- Get token
  SELECT * INTO v_token
  FROM agent_tool_tokens
  WHERE id = p_token_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_or_expired_token'
    );
  END IF;

  -- Get tool
  SELECT * INTO v_tool
  FROM agent_tools
  WHERE id = p_tool_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'tool_not_found'
    );
  END IF;

  -- Check explicit denial
  IF p_tool_id = ANY(v_token.denied_tools) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'tool_explicitly_denied'
    );
  END IF;

  -- Check if tool is in allowed list (if list is not empty)
  IF array_length(v_token.allowed_tools, 1) > 0 AND NOT (p_tool_id = ANY(v_token.allowed_tools)) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'tool_not_in_allowed_list'
    );
  END IF;

  -- Check risk level
  IF (
    CASE v_tool.risk_level
      WHEN 'low' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'high' THEN 3
      WHEN 'critical' THEN 4
      ELSE 0
    END
  ) > (
    CASE v_token.max_risk_level
      WHEN 'low' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'high' THEN 3
      WHEN 'critical' THEN 4
      ELSE 2
    END
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'risk_level_exceeded',
      'tool_risk', v_tool.risk_level,
      'max_allowed', v_token.max_risk_level
    );
  END IF;

  -- Check if approval is required
  v_requires_approval := v_tool.requires_approval
    OR (p_tool_id = ANY(v_token.require_approval_for));

  -- TODO: Add rate limiting check here

  RETURN jsonb_build_object(
    'allowed', true,
    'requires_approval', v_requires_approval,
    'approval_timeout', v_tool.approval_timeout_seconds,
    'tool', jsonb_build_object(
      'id', v_tool.id,
      'name', v_tool.name,
      'risk_level', v_tool.risk_level,
      'category', v_tool.category
    )
  );
END;
$$;

-- Create approval request
CREATE OR REPLACE FUNCTION create_tool_approval_request(
  p_token_id UUID,
  p_tool_id UUID,
  p_request_payload JSONB,
  p_context JSONB DEFAULT '{}'::JSONB,
  p_timeout_seconds INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token agent_tool_tokens;
  v_tool agent_tools;
  v_approval_id UUID;
  v_timeout INTEGER;
BEGIN
  -- Get token
  SELECT * INTO v_token FROM agent_tool_tokens WHERE id = p_token_id;

  -- Get tool
  SELECT * INTO v_tool FROM agent_tools WHERE id = p_tool_id;

  -- Determine timeout
  v_timeout := COALESCE(p_timeout_seconds, v_tool.approval_timeout_seconds, 300);

  -- Create approval request
  INSERT INTO agent_tool_approvals (
    organization_id,
    token_id,
    tool_id,
    request_payload,
    request_context,
    reason,
    expires_at
  ) VALUES (
    v_token.organization_id,
    p_token_id,
    p_tool_id,
    p_request_payload,
    p_context,
    'Tool ' || v_tool.name || ' requires human approval (risk level: ' || v_tool.risk_level || ')',
    NOW() + (v_timeout || ' seconds')::INTERVAL
  )
  RETURNING id INTO v_approval_id;

  RETURN v_approval_id;
END;
$$;

-- Approve or deny a request
CREATE OR REPLACE FUNCTION decide_tool_approval(
  p_approval_id UUID,
  p_decision TEXT, -- 'approved' or 'denied'
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval agent_tool_approvals;
BEGIN
  -- Get and lock approval
  SELECT * INTO v_approval
  FROM agent_tool_approvals
  WHERE id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'approval_not_found');
  END IF;

  IF v_approval.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'approval_already_decided', 'status', v_approval.status);
  END IF;

  IF v_approval.expires_at < NOW() THEN
    UPDATE agent_tool_approvals SET status = 'expired' WHERE id = p_approval_id;
    RETURN jsonb_build_object('success', false, 'error', 'approval_expired');
  END IF;

  -- Update approval
  UPDATE agent_tool_approvals
  SET
    status = p_decision,
    decided_by = auth.uid(),
    decided_at = NOW(),
    decision_reason = p_reason
  WHERE id = p_approval_id;

  RETURN jsonb_build_object(
    'success', true,
    'decision', p_decision,
    'approval_id', p_approval_id
  );
END;
$$;

-- #############################################
-- PART 7: Default tools
-- #############################################

INSERT INTO agent_tools (name, display_name, description, category, risk_level, requires_approval, capabilities) VALUES
  ('file_read', 'Read File', 'Read contents of a file', 'read', 'low', false, '["file:read"]'::JSONB),
  ('file_write', 'Write File', 'Write or create a file', 'write', 'medium', false, '["file:write"]'::JSONB),
  ('file_delete', 'Delete File', 'Delete a file', 'write', 'high', true, '["file:delete"]'::JSONB),
  ('api_get', 'API GET Request', 'Make HTTP GET request', 'external', 'low', false, '["api:read"]'::JSONB),
  ('api_post', 'API POST Request', 'Make HTTP POST request', 'external', 'medium', false, '["api:write"]'::JSONB),
  ('database_query', 'Database Query', 'Execute read-only SQL query', 'read', 'medium', false, '["db:read"]'::JSONB),
  ('database_modify', 'Database Modify', 'Execute write SQL query', 'write', 'high', true, '["db:write"]'::JSONB),
  ('shell_execute', 'Shell Command', 'Execute shell command', 'execute', 'critical', true, '["shell:execute"]'::JSONB),
  ('email_send', 'Send Email', 'Send email to specified recipients', 'external', 'high', true, '["email:send"]'::JSONB),
  ('payment_process', 'Process Payment', 'Process a payment transaction', 'admin', 'critical', true, '["payment:process"]'::JSONB)
ON CONFLICT (name) DO NOTHING;

-- #############################################
-- PART 8: Triggers
-- #############################################

-- Update timestamps
CREATE OR REPLACE FUNCTION update_tool_gating_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_tools_updated
  BEFORE UPDATE ON agent_tools
  FOR EACH ROW
  EXECUTE FUNCTION update_tool_gating_timestamp();

CREATE TRIGGER trg_tool_policies_updated
  BEFORE UPDATE ON agent_tool_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_tool_gating_timestamp();

-- Expire old approval requests
CREATE OR REPLACE FUNCTION expire_old_approval_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE agent_tool_approvals
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;
