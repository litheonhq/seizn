-- Migration: 20260202_016_transparency_events.sql
-- Description: EU AI Act Article 50 Transparency Events
-- Purpose: Track AI interaction disclosures and synthetic content marking
-- Compliance: EU AI Act Article 50 (effective 2026-08-02)

-- #############################################
-- PART 1: Transparency Events Table
-- #############################################

CREATE TABLE IF NOT EXISTS winter_transparency_events (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  session_id TEXT,

  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ai_interaction_disclosure',
    'synthetic_content_marking',
    'deepfake_disclosure',
    'emotion_recognition',
    'biometric_categorization'
  )),

  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Disclosure details (JSONB)
  disclosure JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "message": "string",
  --   "machineReadable": boolean,
  --   "method": "inline|banner|metadata|watermark|api_response",
  --   "verified": boolean,
  --   "userAcknowledged": boolean,
  --   "acknowledgedAt": "timestamp"
  -- }

  -- Content metadata (JSONB)
  content JSONB,
  -- Expected structure:
  -- {
  --   "type": "text|image|audio|video|multimodal",
  --   "metadata": { ... SyntheticContentMetadata },
  --   "publicationContext": "public_interest|commercial|...",
  --   "destinationPlatform": "string"
  -- }

  -- Audit trail (JSONB)
  audit JSONB DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "requestId": "uuid",
  --   "traceId": "string",
  --   "clientInfo": { "ip": "hash", "userAgent": "string", "sdkVersion": "string" }
  -- }

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_transparency_events_org_id ON winter_transparency_events(organization_id);
CREATE INDEX idx_transparency_events_user_id ON winter_transparency_events(user_id);
CREATE INDEX idx_transparency_events_type ON winter_transparency_events(event_type);
CREATE INDEX idx_transparency_events_timestamp ON winter_transparency_events(timestamp DESC);
CREATE INDEX idx_transparency_events_session ON winter_transparency_events(session_id) WHERE session_id IS NOT NULL;

-- GIN index for JSONB queries
CREATE INDEX idx_transparency_events_content ON winter_transparency_events USING GIN (content jsonb_path_ops);
CREATE INDEX idx_transparency_events_disclosure ON winter_transparency_events USING GIN (disclosure jsonb_path_ops);

-- #############################################
-- PART 2: Transparency Configuration Table
-- #############################################

CREATE TABLE IF NOT EXISTS winter_transparency_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  enabled BOOLEAN NOT NULL DEFAULT true,
  default_disclosure_method TEXT NOT NULL DEFAULT 'api_response' CHECK (default_disclosure_method IN (
    'inline', 'banner', 'metadata', 'watermark', 'api_response'
  )),

  -- Per-content-type settings (JSONB)
  content_settings JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Audit settings
  log_all_events BOOLEAN NOT NULL DEFAULT true,
  retention_days INTEGER NOT NULL DEFAULT 2555, -- ~7 years for compliance

  -- Integration settings
  webhook_url TEXT,
  c2pa_enabled BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transparency_configs_org ON winter_transparency_configs(organization_id);

-- #############################################
-- PART 3: Row Level Security
-- #############################################

ALTER TABLE winter_transparency_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_transparency_configs ENABLE ROW LEVEL SECURITY;

-- Transparency Events Policies
DROP POLICY IF EXISTS "Org members can view transparency events" ON winter_transparency_events;
CREATE POLICY "Org members can view transparency events"
  ON winter_transparency_events FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Service role can manage transparency events" ON winter_transparency_events;
CREATE POLICY "Service role can manage transparency events"
  ON winter_transparency_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Transparency Config Policies
DROP POLICY IF EXISTS "Org admins can view transparency config" ON winter_transparency_configs;
CREATE POLICY "Org admins can view transparency config"
  ON winter_transparency_configs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Org admins can update transparency config" ON winter_transparency_configs;
CREATE POLICY "Org admins can update transparency config"
  ON winter_transparency_configs FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Service role can manage transparency config" ON winter_transparency_configs;
CREATE POLICY "Service role can manage transparency config"
  ON winter_transparency_configs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- #############################################
-- PART 4: Updated_at Trigger
-- #############################################

CREATE OR REPLACE FUNCTION update_transparency_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_transparency_config_updated_at ON winter_transparency_configs;
CREATE TRIGGER trigger_transparency_config_updated_at
  BEFORE UPDATE ON winter_transparency_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_transparency_config_updated_at();

-- #############################################
-- PART 5: Comments
-- #############################################

COMMENT ON TABLE winter_transparency_events IS 'EU AI Act Article 50 transparency event tracking';
COMMENT ON TABLE winter_transparency_configs IS 'Organization-level transparency configuration';

COMMENT ON COLUMN winter_transparency_events.event_type IS 'Type: ai_interaction_disclosure, synthetic_content_marking, deepfake_disclosure, emotion_recognition, biometric_categorization';
COMMENT ON COLUMN winter_transparency_events.disclosure IS 'Disclosure details including method, verification status, and user acknowledgment';
COMMENT ON COLUMN winter_transparency_events.content IS 'Synthetic content metadata including type, machine-readable metadata, and publication context';

COMMENT ON COLUMN winter_transparency_configs.retention_days IS 'Default 2555 days (~7 years) for regulatory compliance';
COMMENT ON COLUMN winter_transparency_configs.c2pa_enabled IS 'Enable C2PA/Content Credentials integration';
