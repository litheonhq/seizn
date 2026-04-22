-- Migration: Memory Policy Decisions
-- Logs all storage/deletion/masking decisions for audit and compliance
-- Part of Memory OS - Governance and audit system

-- ===========================================
-- 1. Memory Policy Decisions Table
-- ===========================================

CREATE TABLE IF NOT EXISTS memory_policy_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL, -- Nullable: may not exist if rejected
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Decision information
  decision TEXT NOT NULL CHECK (decision IN (
    'stored',    -- Memory was stored successfully
    'rejected',  -- Memory was rejected (not stored)
    'masked',    -- Memory was stored with PII masked
    'deleted',   -- Memory was deleted
    'updated'    -- Memory was modified due to policy
  )),

  -- Reason for the decision
  reason TEXT NOT NULL CHECK (reason IN (
    'pii_detected',        -- Personal Identifiable Information found
    'ttl_expired',         -- Time-to-live policy triggered
    'user_request',        -- User explicitly requested action
    'policy_violation',    -- Violated content policy
    'duplicate',           -- Duplicate memory detected
    'low_importance',      -- Below importance threshold
    'decay_threshold',     -- Memory decay triggered deletion
    'quota_exceeded',      -- User quota exceeded
    'compliance',          -- Regulatory compliance requirement
    'merge_operation',     -- Memory merged with another
    'system_cleanup',      -- System maintenance cleanup
    'manual_review',       -- Manual review decision
    'normal_operation'     -- Standard operation, no special reason
  )),

  policy_rule TEXT,              -- Which specific rule triggered (e.g., "pii_email_mask", "ttl_30_days")
  input_hash TEXT,               -- Hash of original input for dedup detection

  -- Additional context
  metadata JSONB DEFAULT '{}',   -- Additional details (original content hash, matched patterns, etc.)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 2. Indexes
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_policy_decisions_user_id
  ON memory_policy_decisions(user_id);

CREATE INDEX IF NOT EXISTS idx_policy_decisions_decision
  ON memory_policy_decisions(decision);

CREATE INDEX IF NOT EXISTS idx_policy_decisions_reason
  ON memory_policy_decisions(reason);

CREATE INDEX IF NOT EXISTS idx_policy_decisions_created_at
  ON memory_policy_decisions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_decisions_user_created
  ON memory_policy_decisions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_decisions_memory_id
  ON memory_policy_decisions(memory_id)
  WHERE memory_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_policy_decisions_input_hash
  ON memory_policy_decisions(input_hash)
  WHERE input_hash IS NOT NULL;

-- ===========================================
-- 3. Row Level Security
-- ===========================================

ALTER TABLE memory_policy_decisions ENABLE ROW LEVEL SECURITY;

-- Users can view their own policy decisions
CREATE POLICY "Users can view own policy decisions"
  ON memory_policy_decisions FOR SELECT
  USING (user_id = auth.uid()::text);

-- Users can insert their own policy decisions (typically via API)
CREATE POLICY "Users can insert own policy decisions"
  ON memory_policy_decisions FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- Service role bypass for system operations
CREATE POLICY "Service role has full access to policy decisions"
  ON memory_policy_decisions FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ===========================================
-- 4. Helper Functions
-- ===========================================

-- Function to log a policy decision
CREATE OR REPLACE FUNCTION log_policy_decision(
  p_memory_id UUID,
  p_user_id TEXT,
  p_decision TEXT,
  p_reason TEXT,
  p_policy_rule TEXT DEFAULT NULL,
  p_input_hash TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_decision_id UUID;
BEGIN
  INSERT INTO memory_policy_decisions (
    memory_id,
    user_id,
    decision,
    reason,
    policy_rule,
    input_hash,
    metadata
  ) VALUES (
    p_memory_id,
    p_user_id,
    p_decision,
    p_reason,
    p_policy_rule,
    p_input_hash,
    p_metadata
  )
  RETURNING id INTO v_decision_id;

  RETURN v_decision_id;
END;
$$;

-- Function to get policy decision statistics for a user
CREATE OR REPLACE FUNCTION get_policy_decision_stats(
  p_user_id TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  decision TEXT,
  reason TEXT,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mpd.decision,
    mpd.reason,
    COUNT(*)::BIGINT
  FROM memory_policy_decisions mpd
  WHERE mpd.user_id = p_user_id
    AND mpd.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY mpd.decision, mpd.reason
  ORDER BY COUNT(*) DESC;
END;
$$;

-- Function to check for duplicate input
CREATE OR REPLACE FUNCTION check_duplicate_input(
  p_user_id TEXT,
  p_input_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM memory_policy_decisions
    WHERE user_id = p_user_id
      AND input_hash = p_input_hash
      AND decision = 'stored'
      AND created_at >= NOW() - INTERVAL '24 hours'
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- ===========================================
-- 5. Comments
-- ===========================================

COMMENT ON TABLE memory_policy_decisions IS 'Audit log for all memory storage, deletion, and modification decisions';
COMMENT ON COLUMN memory_policy_decisions.memory_id IS 'Reference to the memory (nullable if rejected before creation)';
COMMENT ON COLUMN memory_policy_decisions.decision IS 'The action taken: stored, rejected, masked, deleted, or updated';
COMMENT ON COLUMN memory_policy_decisions.reason IS 'Why the decision was made (e.g., pii_detected, ttl_expired)';
COMMENT ON COLUMN memory_policy_decisions.policy_rule IS 'Specific policy rule that triggered the decision';
COMMENT ON COLUMN memory_policy_decisions.input_hash IS 'Hash of original input for duplicate detection';
