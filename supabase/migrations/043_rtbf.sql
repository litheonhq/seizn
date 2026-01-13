-- Seizn Winter - RTBF (Right to Be Forgotten)
-- Migration: 043_rtbf.sql
-- GDPR Article 17 "Right to erasure" compliant deletion system

-- ===========================================
-- 1) RTBF Requests Table
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_rtbf_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Participants
  requester_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Scope definition
  scope TEXT NOT NULL CHECK (scope IN ('user', 'memory', 'namespace', 'date_range')),
  scope_params JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Request details
  reason TEXT NOT NULL,
  legal_basis TEXT, -- GDPR legal basis (consent, legitimate_interest, etc.)
  retain_audit_log BOOLEAN NOT NULL DEFAULT TRUE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  phase TEXT NOT NULL DEFAULT 'requested' CHECK (phase IN ('requested', 'analyzing', 'backing_up', 'soft_delete', 'hard_delete', 'verifying', 'completed', 'failed')),

  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Additional metadata
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

-- Indexes for RTBF requests
CREATE INDEX IF NOT EXISTS idx_rtbf_requests_requester
ON winter_rtbf_requests(requester_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_rtbf_requests_subject
ON winter_rtbf_requests(subject_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_rtbf_requests_status
ON winter_rtbf_requests(status, requested_at DESC);

-- ===========================================
-- 2) RTBF Audit Logs Table
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_rtbf_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Reference to request
  request_id UUID NOT NULL REFERENCES winter_rtbf_requests(id) ON DELETE CASCADE,

  -- Participants
  requester_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Scope
  scope TEXT NOT NULL,
  scope_params JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Results
  affected_tables TEXT[] NOT NULL DEFAULT '{}',
  affected_count INTEGER NOT NULL DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  phase TEXT NOT NULL DEFAULT 'requested',

  -- Verification
  verification_hash TEXT,
  backup_id UUID,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error tracking
  error TEXT
);

-- Indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_rtbf_audit_request
ON winter_rtbf_audit_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_rtbf_audit_requester
ON winter_rtbf_audit_logs(requester_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_rtbf_audit_subject
ON winter_rtbf_audit_logs(subject_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_rtbf_audit_status
ON winter_rtbf_audit_logs(status, requested_at DESC);

-- ===========================================
-- 3) RTBF Backups Table (Encrypted)
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_rtbf_backups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Reference to request
  request_id UUID NOT NULL REFERENCES winter_rtbf_requests(id) ON DELETE CASCADE,

  -- Encrypted backup data
  backup_data TEXT NOT NULL, -- AES-256-GCM encrypted JSON
  data_hash TEXT NOT NULL, -- SHA-256 hash of original data

  -- Retention
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

-- Indexes for backups
CREATE INDEX IF NOT EXISTS idx_rtbf_backups_request
ON winter_rtbf_backups(request_id);

CREATE INDEX IF NOT EXISTS idx_rtbf_backups_expires
ON winter_rtbf_backups(expires_at)
WHERE NOT legal_hold;

-- ===========================================
-- 4) Add deleted_at column to memories table
-- ===========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE memories ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index for soft-deleted memories
CREATE INDEX IF NOT EXISTS idx_memories_deleted_at
ON memories(deleted_at)
WHERE deleted_at IS NOT NULL;

-- ===========================================
-- 5) Row Level Security
-- ===========================================
ALTER TABLE winter_rtbf_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_rtbf_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_rtbf_backups ENABLE ROW LEVEL SECURITY;

-- RTBF Requests policies
CREATE POLICY "Users can view own RTBF requests"
  ON winter_rtbf_requests FOR SELECT
  USING (auth.uid()::TEXT = requester_id OR auth.uid()::TEXT = subject_id);

CREATE POLICY "Users can create own RTBF requests"
  ON winter_rtbf_requests FOR INSERT
  WITH CHECK (auth.uid()::TEXT = requester_id);

CREATE POLICY "Users can update own RTBF requests"
  ON winter_rtbf_requests FOR UPDATE
  USING (auth.uid()::TEXT = requester_id);

-- Audit Logs policies (read-only for users)
CREATE POLICY "Users can view own RTBF audit logs"
  ON winter_rtbf_audit_logs FOR SELECT
  USING (auth.uid()::TEXT = requester_id OR auth.uid()::TEXT = subject_id);

CREATE POLICY "Service role can insert audit logs"
  ON winter_rtbf_audit_logs FOR INSERT
  WITH CHECK (TRUE); -- Service role bypass

CREATE POLICY "Service role can update audit logs"
  ON winter_rtbf_audit_logs FOR UPDATE
  USING (TRUE); -- Service role bypass

-- Backups policies (service role only for data access)
CREATE POLICY "Users can view own backup metadata"
  ON winter_rtbf_backups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winter_rtbf_requests r
      WHERE r.id = winter_rtbf_backups.request_id
      AND (auth.uid()::TEXT = r.requester_id OR auth.uid()::TEXT = r.subject_id)
    )
  );

CREATE POLICY "Service role can manage backups"
  ON winter_rtbf_backups FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- ===========================================
-- 6) Cleanup Function for Expired Backups
-- ===========================================
CREATE OR REPLACE FUNCTION cleanup_expired_rtbf_backups()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM winter_rtbf_backups
  WHERE expires_at < NOW()
  AND NOT legal_hold;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

-- ===========================================
-- 7) Function to Get RTBF Statistics
-- ===========================================
CREATE OR REPLACE FUNCTION get_rtbf_statistics(p_user_id TEXT DEFAULT NULL)
RETURNS TABLE (
  total_requests BIGINT,
  completed_requests BIGINT,
  failed_requests BIGINT,
  pending_requests BIGINT,
  total_records_deleted BIGINT,
  avg_completion_time_seconds NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_requests,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_requests,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed_requests,
    COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::BIGINT AS pending_requests,
    COALESCE(SUM(a.affected_count), 0)::BIGINT AS total_records_deleted,
    COALESCE(
      AVG(
        EXTRACT(EPOCH FROM (r.completed_at - r.requested_at))
      ) FILTER (WHERE r.status = 'completed'),
      0
    )::NUMERIC AS avg_completion_time_seconds
  FROM winter_rtbf_requests r
  LEFT JOIN winter_rtbf_audit_logs a ON a.request_id = r.id
  WHERE (p_user_id IS NULL OR r.requester_id = p_user_id);
END;
$$;

-- ===========================================
-- 8) Trigger for Audit Log on Request Status Change
-- ===========================================
CREATE OR REPLACE FUNCTION log_rtbf_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only log significant status changes
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.phase IS DISTINCT FROM NEW.phase THEN
    UPDATE winter_rtbf_audit_logs
    SET
      status = NEW.status,
      phase = NEW.phase,
      started_at = CASE
        WHEN OLD.status = 'pending' AND NEW.status = 'processing' THEN NOW()
        ELSE started_at
      END,
      completed_at = CASE
        WHEN NEW.status IN ('completed', 'failed', 'cancelled') THEN NOW()
        ELSE completed_at
      END
    WHERE request_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rtbf_status_change
AFTER UPDATE ON winter_rtbf_requests
FOR EACH ROW
EXECUTE FUNCTION log_rtbf_status_change();

-- ===========================================
-- 9) View for RTBF Dashboard
-- ===========================================
CREATE OR REPLACE VIEW v_rtbf_dashboard AS
SELECT
  r.id AS request_id,
  r.requester_id,
  r.subject_id,
  r.scope,
  r.reason,
  r.status,
  r.phase,
  r.requested_at,
  r.completed_at,
  a.affected_tables,
  a.affected_count,
  a.verification_hash,
  EXTRACT(EPOCH FROM (COALESCE(r.completed_at, NOW()) - r.requested_at)) AS duration_seconds,
  CASE
    WHEN r.status = 'completed' THEN 100
    WHEN r.phase = 'verifying' THEN 90
    WHEN r.phase = 'hard_delete' THEN 70
    WHEN r.phase = 'soft_delete' THEN 50
    WHEN r.phase = 'backing_up' THEN 30
    WHEN r.phase = 'analyzing' THEN 20
    WHEN r.phase = 'requested' THEN 10
    ELSE 0
  END AS progress_percent
FROM winter_rtbf_requests r
LEFT JOIN winter_rtbf_audit_logs a ON a.request_id = r.id;

-- Grant access to the view
GRANT SELECT ON v_rtbf_dashboard TO authenticated;

-- ===========================================
-- 10) Comments for Documentation
-- ===========================================
COMMENT ON TABLE winter_rtbf_requests IS 'GDPR Article 17 Right to Erasure requests';
COMMENT ON TABLE winter_rtbf_audit_logs IS 'Immutable audit trail for RTBF compliance';
COMMENT ON TABLE winter_rtbf_backups IS 'Encrypted backups for legal retention requirements';

COMMENT ON COLUMN winter_rtbf_requests.scope IS 'Erasure scope: user, memory, namespace, or date_range';
COMMENT ON COLUMN winter_rtbf_requests.legal_basis IS 'GDPR legal basis for erasure request';
COMMENT ON COLUMN winter_rtbf_requests.retain_audit_log IS 'Whether to retain audit log after erasure (recommended TRUE)';

COMMENT ON COLUMN winter_rtbf_audit_logs.verification_hash IS 'SHA-256 hash proving deletion completion';
COMMENT ON COLUMN winter_rtbf_audit_logs.affected_tables IS 'List of tables from which data was deleted';

COMMENT ON COLUMN winter_rtbf_backups.backup_data IS 'AES-256-GCM encrypted JSON of deleted data';
COMMENT ON COLUMN winter_rtbf_backups.legal_hold IS 'If TRUE, backup is exempt from auto-deletion';

COMMENT ON FUNCTION cleanup_expired_rtbf_backups() IS 'Remove expired backups not under legal hold';
COMMENT ON FUNCTION get_rtbf_statistics(TEXT) IS 'Get RTBF statistics for a user or globally';
