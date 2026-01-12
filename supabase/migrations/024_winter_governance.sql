-- Seizn Winter - Governance (Policy, PII, Right-to-be-forgotten)
-- Migration: 024_winter_governance.sql

-- ===========================================
-- 1) Policies (generic)
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  policy_type TEXT NOT NULL, -- memory|pii|retention|federation|...
  scope TEXT NOT NULL DEFAULT 'user', -- user|project|session|agent (extensible)
  name TEXT NOT NULL DEFAULT 'default',
  config JSONB NOT NULL DEFAULT '{}'::JSONB,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winter_policies_user
ON winter_policies(user_id, updated_at DESC);

-- ===========================================
-- 2) PII events (audit trail)
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_pii_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  policy_id UUID NULL REFERENCES winter_policies(id) ON DELETE SET NULL,

  event_type TEXT NOT NULL, -- detect|mask|deny|encrypt|delete
  input_hash TEXT NULL,

  detected JSONB NOT NULL DEFAULT '{}'::JSONB, -- what was detected
  action TEXT NOT NULL, -- allow|mask|deny|encrypt
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winter_pii_events_user_created
ON winter_pii_events(user_id, created_at DESC);

-- ===========================================
-- 3) Deletion jobs (right-to-be-forgotten)
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_deletion_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'queued', -- queued|running|success|failed
  reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  requested_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,

  error TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_winter_deletion_jobs_user_created
ON winter_deletion_jobs(user_id, requested_at DESC);

-- ===========================================
-- 4) RLS
-- ===========================================
ALTER TABLE winter_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_pii_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_deletion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own winter_policies"
  ON winter_policies FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own winter_policies"
  ON winter_policies FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can update own winter_policies"
  ON winter_policies FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view own winter_pii_events"
  ON winter_pii_events FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own winter_pii_events"
  ON winter_pii_events FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view own winter_deletion_jobs"
  ON winter_deletion_jobs FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own winter_deletion_jobs"
  ON winter_deletion_jobs FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can update own winter_deletion_jobs"
  ON winter_deletion_jobs FOR UPDATE
  USING (auth.uid()::TEXT = user_id);
