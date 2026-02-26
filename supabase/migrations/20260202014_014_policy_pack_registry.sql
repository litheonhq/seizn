-- Migration: 20260202_014_policy_pack_registry.sql
-- Description: Policy Pack Registry for signed, versioned governance policy packages
-- Enables marketplace-style policy distribution
-- Created: 2026-02-02

-- #############################################
-- PART 1: Policy Packs
-- #############################################

CREATE TABLE IF NOT EXISTS policy_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL UNIQUE, -- e.g., 'pii-basic', 'retention-gdpr'
  display_name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,

  -- Categorization
  category TEXT NOT NULL, -- 'privacy', 'retention', 'security', 'compliance', 'custom'
  tags TEXT[] DEFAULT '{}',

  -- Publisher
  publisher TEXT NOT NULL, -- 'seizn' for official, org name for custom
  publisher_verified BOOLEAN NOT NULL DEFAULT false,

  -- Visibility
  visibility TEXT NOT NULL DEFAULT 'private', -- 'public', 'private', 'unlisted'
  is_official BOOLEAN NOT NULL DEFAULT false,

  -- Stats
  install_count INTEGER NOT NULL DEFAULT 0,
  star_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  homepage_url TEXT,
  repository_url TEXT,
  documentation_url TEXT,
  support_email TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_policy_packs_category ON policy_packs(category);
CREATE INDEX IF NOT EXISTS idx_policy_packs_visibility ON policy_packs(visibility);
CREATE INDEX IF NOT EXISTS idx_policy_packs_official ON policy_packs(is_official) WHERE is_official = true;
CREATE INDEX IF NOT EXISTS idx_policy_packs_search ON policy_packs USING GIN(to_tsvector('english', name || ' ' || display_name || ' ' || COALESCE(description, '')));

COMMENT ON TABLE policy_packs IS 'Registry of governance policy packages';

-- #############################################
-- PART 2: Policy Pack Versions
-- #############################################

CREATE TABLE IF NOT EXISTS policy_pack_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES policy_packs(id) ON DELETE CASCADE,

  -- Version
  version TEXT NOT NULL, -- Semantic versioning: '1.0.0'
  version_major INTEGER NOT NULL,
  version_minor INTEGER NOT NULL,
  version_patch INTEGER NOT NULL,

  -- Content
  policies JSONB NOT NULL, -- Array of policy definitions
  schemas JSONB DEFAULT '{}', -- JSON schemas for validation
  examples JSONB DEFAULT '[]', -- Example configurations

  -- Signing
  signature TEXT, -- GPG signature of content hash
  content_hash TEXT NOT NULL, -- SHA-256 of policies JSONB
  signed_by TEXT, -- Key ID that signed

  -- Compatibility
  min_platform_version TEXT, -- Minimum Seizn version required
  max_platform_version TEXT,
  dependencies JSONB DEFAULT '[]', -- Other required packs

  -- Status
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published', 'deprecated', 'yanked'
  published_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,
  deprecation_reason TEXT,

  -- Release notes
  changelog TEXT,
  breaking_changes TEXT[],

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(pack_id, version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pack_versions_pack ON policy_pack_versions(pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_versions_status ON policy_pack_versions(status);
CREATE INDEX IF NOT EXISTS idx_pack_versions_published ON policy_pack_versions(published_at DESC) WHERE status = 'published';

-- Constraint for semantic versioning order
CREATE INDEX IF NOT EXISTS idx_pack_versions_semver ON policy_pack_versions(pack_id, version_major DESC, version_minor DESC, version_patch DESC);

COMMENT ON TABLE policy_pack_versions IS 'Versioned releases of policy packs with signing';

-- #############################################
-- PART 3: Policy Pack Installations
-- #############################################

CREATE TABLE IF NOT EXISTS policy_pack_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES policy_packs(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES policy_pack_versions(id),

  -- Configuration
  config JSONB DEFAULT '{}', -- Organization-specific overrides
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Auto-update settings
  auto_update BOOLEAN NOT NULL DEFAULT false,
  update_channel TEXT DEFAULT 'stable', -- 'stable', 'latest', 'pinned'
  pinned_version TEXT, -- If update_channel = 'pinned'

  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'pending_update'
  last_evaluated_at TIMESTAMPTZ,
  evaluation_errors JSONB,

  -- Audit
  installed_by UUID REFERENCES auth.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, pack_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pack_installs_org ON policy_pack_installations(organization_id);
CREATE INDEX IF NOT EXISTS idx_pack_installs_pack ON policy_pack_installations(pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_installs_status ON policy_pack_installations(status);

-- RLS
ALTER TABLE policy_pack_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage pack installations"
  ON policy_pack_installations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE policy_pack_installations IS 'Organization installations of policy packs';

-- #############################################
-- PART 4: Policy Pack Reviews/Ratings
-- #############################################

CREATE TABLE IF NOT EXISTS policy_pack_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES policy_packs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),

  -- Review
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT,

  -- Metadata
  helpful_count INTEGER NOT NULL DEFAULT 0,
  verified_installation BOOLEAN NOT NULL DEFAULT false,

  -- Status
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(pack_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pack_reviews_pack ON policy_pack_reviews(pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_reviews_rating ON policy_pack_reviews(pack_id, rating);

COMMENT ON TABLE policy_pack_reviews IS 'User reviews and ratings for policy packs';

-- #############################################
-- PART 5: Official Policy Packs (Seed Data)
-- #############################################

-- Insert official policy packs
INSERT INTO policy_packs (name, display_name, description, category, publisher, publisher_verified, visibility, is_official) VALUES
  ('pii-basic', 'PII Basic', 'Basic PII detection and redaction for common data types (email, phone, SSN)', 'privacy', 'seizn', true, 'public', true),
  ('pii-strict', 'PII Strict', 'Comprehensive PII detection with advanced entity recognition and context-aware redaction', 'privacy', 'seizn', true, 'public', true),
  ('retention-gdpr', 'GDPR Retention', 'Data retention policies compliant with GDPR Article 5(1)(e) storage limitation', 'retention', 'seizn', true, 'public', true),
  ('retention-ccpa', 'CCPA Retention', 'Data retention policies for California Consumer Privacy Act compliance', 'retention', 'seizn', true, 'public', true),
  ('retention-hipaa', 'HIPAA Retention', 'Healthcare data retention policies for HIPAA compliance', 'retention', 'seizn', true, 'public', true),
  ('security-baseline', 'Security Baseline', 'Essential security policies including access control and audit logging', 'security', 'seizn', true, 'public', true),
  ('ai-safety-basic', 'AI Safety Basic', 'Basic AI safety guardrails for content filtering and output validation', 'compliance', 'seizn', true, 'public', true),
  ('ai-safety-enterprise', 'AI Safety Enterprise', 'Enterprise-grade AI safety with tool gating and human-in-the-loop', 'compliance', 'seizn', true, 'public', true)
ON CONFLICT (name) DO NOTHING;

-- Insert initial versions for official packs
INSERT INTO policy_pack_versions (pack_id, version, version_major, version_minor, version_patch, status, published_at, content_hash, policies, changelog)
SELECT
  id,
  '1.0.0',
  1, 0, 0,
  'published',
  NOW(),
  encode(sha256(('initial-' || name)::bytea), 'hex'),
  CASE name
    WHEN 'pii-basic' THEN '{
      "rules": [
        {"type": "redact", "pattern": "email", "replacement": "[EMAIL]"},
        {"type": "redact", "pattern": "phone", "replacement": "[PHONE]"},
        {"type": "redact", "pattern": "ssn", "replacement": "[SSN]"}
      ]
    }'::JSONB
    WHEN 'pii-strict' THEN '{
      "rules": [
        {"type": "redact", "pattern": "email", "replacement": "[EMAIL]"},
        {"type": "redact", "pattern": "phone", "replacement": "[PHONE]"},
        {"type": "redact", "pattern": "ssn", "replacement": "[SSN]"},
        {"type": "redact", "pattern": "credit_card", "replacement": "[CARD]"},
        {"type": "redact", "pattern": "address", "replacement": "[ADDRESS]"},
        {"type": "ner", "model": "seizn/pii-ner-v2"}
      ]
    }'::JSONB
    WHEN 'retention-gdpr' THEN '{
      "defaults": {
        "user_data": {"days": 365, "action": "anonymize"},
        "logs": {"days": 90, "action": "delete"},
        "backups": {"days": 30, "action": "delete"}
      },
      "legal_holds": true,
      "right_to_erasure": true
    }'::JSONB
    ELSE '{}'::JSONB
  END,
  'Initial release'
FROM policy_packs
WHERE is_official = true
ON CONFLICT (pack_id, version) DO NOTHING;

-- #############################################
-- PART 6: Functions
-- #############################################

-- Get latest version of a pack
CREATE OR REPLACE FUNCTION get_latest_pack_version(p_pack_id UUID)
RETURNS policy_pack_versions
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_result policy_pack_versions;
BEGIN
  SELECT * INTO v_result
  FROM policy_pack_versions
  WHERE pack_id = p_pack_id
    AND status = 'published'
  ORDER BY version_major DESC, version_minor DESC, version_patch DESC
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- Install policy pack
CREATE OR REPLACE FUNCTION install_policy_pack(
  p_organization_id UUID,
  p_pack_name TEXT,
  p_version TEXT DEFAULT NULL, -- NULL = latest
  p_config JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pack policy_packs;
  v_version policy_pack_versions;
  v_install_id UUID;
BEGIN
  -- Get pack
  SELECT * INTO v_pack
  FROM policy_packs
  WHERE name = p_pack_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Policy pack not found: %', p_pack_name;
  END IF;

  -- Get version
  IF p_version IS NULL THEN
    SELECT * INTO v_version
    FROM policy_pack_versions
    WHERE pack_id = v_pack.id AND status = 'published'
    ORDER BY version_major DESC, version_minor DESC, version_patch DESC
    LIMIT 1;
  ELSE
    SELECT * INTO v_version
    FROM policy_pack_versions
    WHERE pack_id = v_pack.id AND version = p_version AND status = 'published';
  END IF;

  IF v_version IS NULL THEN
    RAISE EXCEPTION 'No published version found for pack: %', p_pack_name;
  END IF;

  -- Install or update
  INSERT INTO policy_pack_installations (
    organization_id,
    pack_id,
    version_id,
    config,
    installed_by
  ) VALUES (
    p_organization_id,
    v_pack.id,
    v_version.id,
    p_config,
    auth.uid()
  )
  ON CONFLICT (organization_id, pack_id) DO UPDATE SET
    version_id = v_version.id,
    config = p_config,
    status = 'active',
    updated_at = NOW()
  RETURNING id INTO v_install_id;

  -- Increment install count
  UPDATE policy_packs
  SET install_count = install_count + 1
  WHERE id = v_pack.id;

  RETURN v_install_id;
END;
$$;

-- Get organization's installed policies
CREATE OR REPLACE FUNCTION get_installed_policies(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'pack_id', p.id,
      'pack_name', p.name,
      'display_name', p.display_name,
      'category', p.category,
      'version', v.version,
      'policies', v.policies,
      'config', i.config,
      'enabled', i.enabled,
      'installed_at', i.installed_at
    ) ORDER BY p.category, p.name
  )
  INTO v_result
  FROM policy_pack_installations i
  JOIN policy_packs p ON p.id = i.pack_id
  JOIN policy_pack_versions v ON v.id = i.version_id
  WHERE i.organization_id = p_organization_id
    AND i.status = 'active'
    AND i.enabled = true;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- #############################################
-- PART 7: Views
-- #############################################

CREATE OR REPLACE VIEW policy_pack_catalog
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.name,
  p.display_name,
  p.description,
  p.category,
  p.tags,
  p.publisher,
  p.publisher_verified,
  p.is_official,
  p.install_count,
  p.star_count,
  v.version AS latest_version,
  v.published_at AS latest_published_at,
  (SELECT AVG(rating)::NUMERIC(2,1) FROM policy_pack_reviews WHERE pack_id = p.id) AS avg_rating,
  (SELECT COUNT(*) FROM policy_pack_reviews WHERE pack_id = p.id) AS review_count
FROM policy_packs p
LEFT JOIN LATERAL (
  SELECT version, published_at
  FROM policy_pack_versions
  WHERE pack_id = p.id AND status = 'published'
  ORDER BY version_major DESC, version_minor DESC, version_patch DESC
  LIMIT 1
) v ON true
WHERE p.visibility = 'public';

COMMENT ON VIEW policy_pack_catalog IS 'Public catalog of available policy packs';

-- #############################################
-- PART 8: Triggers
-- #############################################

CREATE OR REPLACE FUNCTION update_policy_pack_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_policy_packs_updated
  BEFORE UPDATE ON policy_packs
  FOR EACH ROW
  EXECUTE FUNCTION update_policy_pack_timestamp();

CREATE TRIGGER trg_pack_installations_updated
  BEFORE UPDATE ON policy_pack_installations
  FOR EACH ROW
  EXECUTE FUNCTION update_policy_pack_timestamp();
