-- Migration: 068_provider_keys.sql
-- Description: BYOK (Bring Your Own Key) - Provider API keys storage

-- Provider keys table with encryption
CREATE TABLE IF NOT EXISTS provider_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Provider identification
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'cohere', 'voyage', 'google', 'azure')),

  -- Key storage (encrypted at application level before storage)
  key_encrypted TEXT NOT NULL,
  key_hint TEXT, -- Last 4 characters for display (e.g., "...abc1")

  -- Configuration
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Usage tracking
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10, 4) DEFAULT 0,

  -- Metadata
  label TEXT, -- User-friendly name (e.g., "Production OpenAI Key")
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE (user_id, provider, label)
);

-- Index for fast lookups
CREATE INDEX idx_provider_keys_user_provider ON provider_keys(user_id, provider) WHERE is_active = true;
CREATE INDEX idx_provider_keys_org ON provider_keys(org_id) WHERE org_id IS NOT NULL;

-- RLS policies
ALTER TABLE provider_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys
CREATE POLICY "Users can view own provider keys"
  ON provider_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own keys
CREATE POLICY "Users can insert own provider keys"
  ON provider_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own keys
CREATE POLICY "Users can update own provider keys"
  ON provider_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own keys
CREATE POLICY "Users can delete own provider keys"
  ON provider_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update usage stats
CREATE OR REPLACE FUNCTION update_provider_key_usage(
  p_key_id UUID,
  p_cost_usd NUMERIC DEFAULT 0
)
RETURNS void AS $$
BEGIN
  UPDATE provider_keys
  SET
    last_used_at = now(),
    usage_count = usage_count + 1,
    total_cost_usd = total_cost_usd + p_cost_usd,
    updated_at = now()
  WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_provider_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER provider_keys_updated_at
  BEFORE UPDATE ON provider_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_provider_keys_updated_at();

-- Audit log for key operations (security)
CREATE TABLE IF NOT EXISTS provider_keys_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key_id UUID,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'used', 'rotated')),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for audit queries
CREATE INDEX idx_provider_keys_audit_user ON provider_keys_audit(user_id, created_at DESC);

-- RLS for audit table
ALTER TABLE provider_keys_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own key audit logs"
  ON provider_keys_audit FOR SELECT
  USING (auth.uid() = user_id);

-- Comment for documentation
COMMENT ON TABLE provider_keys IS 'BYOK: User-provided API keys for external AI providers (OpenAI, Anthropic, Cohere, Voyage)';
COMMENT ON COLUMN provider_keys.key_encrypted IS 'AES-256 encrypted API key - decrypt at application level only';
COMMENT ON COLUMN provider_keys.key_hint IS 'Last 4 characters of key for UI display';
