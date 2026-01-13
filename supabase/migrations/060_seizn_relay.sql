-- ============================================
-- Migration: Seizn Relay (#19) - Edge Federated Agent
-- ============================================
-- Enables enterprises to keep data on-premises while using Seizn for orchestration.
-- A lightweight relay agent runs in customer VPC and handles local vector search,
-- sending only query results to Seizn cloud.

-- ============================================
-- Registered Relay Agents
-- ============================================

CREATE TABLE IF NOT EXISTS relay_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Agent identification
  name TEXT NOT NULL,
  description TEXT,
  agent_key TEXT UNIQUE NOT NULL,  -- Authentication key for relay (hashed)

  -- Configuration
  endpoint_url TEXT,  -- Where the relay is accessible (if cloud-reachable)
  capabilities JSONB DEFAULT '["retrieve"]'::jsonb,  -- What the relay can do
  collections TEXT[] DEFAULT '{}',  -- Collection IDs this relay serves

  -- Connection mode
  connection_mode TEXT DEFAULT 'callback' CHECK (connection_mode IN ('callback', 'direct', 'hybrid')),
  -- callback: relay calls Seizn when results ready
  -- direct: Seizn calls relay endpoint directly
  -- hybrid: supports both modes

  -- Health & status
  status TEXT DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'error', 'maintenance')),
  last_heartbeat TIMESTAMPTZ,
  last_error TEXT,
  version TEXT,

  -- Metrics
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  avg_latency_ms FLOAT DEFAULT 0,

  -- Security
  ip_whitelist TEXT[],  -- Optional IP whitelist for requests
  tls_required BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique name per user
  CONSTRAINT relay_agents_user_name_unique UNIQUE (user_id, name)
);

-- ============================================
-- Relay Request Logs
-- ============================================

CREATE TABLE IF NOT EXISTS relay_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_id UUID NOT NULL REFERENCES relay_agents(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,

  -- Request info (no sensitive data stored)
  query_hash TEXT,  -- Hash of query for dedup
  collection_id TEXT,
  top_k INTEGER,

  -- Response info
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error', 'timeout')),
  result_count INTEGER,
  latency_ms FLOAT,
  error_message TEXT,

  -- Metadata
  source_ip TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- Relay Pending Callbacks
-- ============================================
-- For callback mode: store pending requests awaiting relay response

CREATE TABLE IF NOT EXISTS relay_pending_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_id UUID NOT NULL REFERENCES relay_agents(id) ON DELETE CASCADE,
  request_id TEXT UNIQUE NOT NULL,

  -- Request payload (encrypted in production)
  payload JSONB NOT NULL,

  -- Callback info
  callback_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'expired')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_relays_user ON relay_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_relays_org ON relay_agents(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_relays_key ON relay_agents(agent_key);
CREATE INDEX IF NOT EXISTS idx_relays_status ON relay_agents(status);
CREATE INDEX IF NOT EXISTS idx_relays_collections ON relay_agents USING GIN (collections);

CREATE INDEX IF NOT EXISTS idx_relay_requests_relay ON relay_requests(relay_id);
CREATE INDEX IF NOT EXISTS idx_relay_requests_request_id ON relay_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_relay_requests_status ON relay_requests(status);
CREATE INDEX IF NOT EXISTS idx_relay_requests_created ON relay_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_relay_callbacks_relay ON relay_pending_callbacks(relay_id);
CREATE INDEX IF NOT EXISTS idx_relay_callbacks_request_id ON relay_pending_callbacks(request_id);
CREATE INDEX IF NOT EXISTS idx_relay_callbacks_expires ON relay_pending_callbacks(expires_at) WHERE status = 'pending';

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE relay_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_pending_callbacks ENABLE ROW LEVEL SECURITY;

-- Users can manage their own relays
CREATE POLICY "Users own their relays" ON relay_agents
  FOR ALL USING (auth.uid() = user_id);

-- Org admins can view org relays
CREATE POLICY "Org admins view org relays" ON relay_agents
  FOR SELECT USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND organization_id = relay_agents.org_id
    )
  );

-- Requests belong to user relays
CREATE POLICY "Requests belong to user relays" ON relay_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM relay_agents
      WHERE id = relay_id AND user_id = auth.uid()
    )
  );

-- Callbacks belong to user relays
CREATE POLICY "Callbacks belong to user relays" ON relay_pending_callbacks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM relay_agents
      WHERE id = relay_id AND user_id = auth.uid()
    )
  );

-- Service role bypass for all tables
CREATE POLICY "Service role full access relays" ON relay_agents
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access requests" ON relay_requests
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access callbacks" ON relay_pending_callbacks
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================
-- Functions
-- ============================================

-- Update relay agent metrics after request completion
CREATE OR REPLACE FUNCTION update_relay_metrics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'error') AND OLD.status = 'processing' THEN
    UPDATE relay_agents
    SET
      total_requests = total_requests + 1,
      successful_requests = CASE WHEN NEW.status = 'completed' THEN successful_requests + 1 ELSE successful_requests END,
      failed_requests = CASE WHEN NEW.status = 'error' THEN failed_requests + 1 ELSE failed_requests END,
      avg_latency_ms = CASE
        WHEN NEW.latency_ms IS NOT NULL AND total_requests > 0
        THEN (avg_latency_ms * total_requests + NEW.latency_ms) / (total_requests + 1)
        ELSE avg_latency_ms
      END,
      updated_at = NOW()
    WHERE id = NEW.relay_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for metrics update
DROP TRIGGER IF EXISTS trigger_update_relay_metrics ON relay_requests;
CREATE TRIGGER trigger_update_relay_metrics
  AFTER UPDATE ON relay_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_relay_metrics();

-- Update relay status based on heartbeat
CREATE OR REPLACE FUNCTION update_relay_heartbeat(
  p_agent_key TEXT,
  p_version TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, relay_id UUID, status TEXT) AS $$
DECLARE
  v_relay_id UUID;
  v_status TEXT;
BEGIN
  UPDATE relay_agents
  SET
    last_heartbeat = NOW(),
    status = 'active',
    version = COALESCE(p_version, version),
    last_error = NULL,
    updated_at = NOW()
  WHERE agent_key = p_agent_key
  RETURNING id, relay_agents.status INTO v_relay_id, v_status;

  IF v_relay_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'unknown'::TEXT;
  ELSE
    RETURN QUERY SELECT TRUE, v_relay_id, v_status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get relay for collection (finds active relay serving a collection)
CREATE OR REPLACE FUNCTION get_relay_for_collection(
  p_user_id UUID,
  p_collection_id TEXT
)
RETURNS TABLE(
  relay_id UUID,
  name TEXT,
  endpoint_url TEXT,
  connection_mode TEXT,
  capabilities JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ra.id,
    ra.name,
    ra.endpoint_url,
    ra.connection_mode,
    ra.capabilities
  FROM relay_agents ra
  WHERE ra.user_id = p_user_id
    AND ra.status = 'active'
    AND p_collection_id = ANY(ra.collections)
  ORDER BY ra.last_heartbeat DESC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up expired callbacks
CREATE OR REPLACE FUNCTION cleanup_expired_relay_callbacks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM relay_pending_callbacks
    WHERE expires_at < NOW() AND status = 'pending'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Updated timestamp trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_relay_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_relay_agents_updated_at ON relay_agents;
CREATE TRIGGER trigger_relay_agents_updated_at
  BEFORE UPDATE ON relay_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_relay_agents_updated_at();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE relay_agents IS 'Registered relay agents for edge federated search';
COMMENT ON TABLE relay_requests IS 'Log of relay search requests';
COMMENT ON TABLE relay_pending_callbacks IS 'Pending callback requests awaiting relay response';
COMMENT ON COLUMN relay_agents.agent_key IS 'Hashed authentication key for relay agent';
COMMENT ON COLUMN relay_agents.connection_mode IS 'How Seizn communicates with relay: callback (relay pushes), direct (Seizn pulls), or hybrid';
COMMENT ON COLUMN relay_agents.capabilities IS 'Array of capabilities: retrieve, health, capabilities';
