-- Temporal Features Migration
--
-- Adds infrastructure for temporal knowledge graph:
-- - Fact invalidation tracking
-- - Temporal query optimizations
-- - Status values for superseded/expired facts

-- =============================================================================
-- 1. Fact Invalidation History Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS spring_fact_invalidations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  invalidated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_by UUID REFERENCES spring_memory_notes(id) ON DELETE SET NULL,
  reason TEXT,
  auto_invalidated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for invalidation lookups
CREATE INDEX IF NOT EXISTS idx_fact_invalidations_memory
  ON spring_fact_invalidations(memory_id);

CREATE INDEX IF NOT EXISTS idx_fact_invalidations_time
  ON spring_fact_invalidations(invalidated_at DESC);

CREATE INDEX IF NOT EXISTS idx_fact_invalidations_by
  ON spring_fact_invalidations(invalidated_by)
  WHERE invalidated_by IS NOT NULL;

-- =============================================================================
-- 2. Add Temporal Columns to Memory Notes (if not exists)
-- =============================================================================

DO $$
BEGIN
  -- Add superseded_by_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'spring_memory_notes' AND column_name = 'superseded_by_id') THEN
    ALTER TABLE spring_memory_notes
    ADD COLUMN superseded_by_id UUID REFERENCES spring_memory_notes(id) ON DELETE SET NULL;
  END IF;

  -- Add event_time column (for episodes - when the event actually occurred)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'spring_memory_notes' AND column_name = 'event_time') THEN
    ALTER TABLE spring_memory_notes
    ADD COLUMN event_time TIMESTAMPTZ;
  END IF;

  -- Ensure valid_from exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'spring_memory_notes' AND column_name = 'valid_from') THEN
    ALTER TABLE spring_memory_notes
    ADD COLUMN valid_from TIMESTAMPTZ;
  END IF;

  -- Ensure valid_to exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'spring_memory_notes' AND column_name = 'valid_to') THEN
    ALTER TABLE spring_memory_notes
    ADD COLUMN valid_to TIMESTAMPTZ;
  END IF;
END $$;

-- =============================================================================
-- 3. Update Status Constraint
-- =============================================================================

-- Drop existing constraint if it doesn't include new statuses
DO $$
BEGIN
  -- Check if constraint exists and update it
  ALTER TABLE spring_memory_notes DROP CONSTRAINT IF EXISTS spring_memory_notes_status_check;
  ALTER TABLE spring_memory_notes ADD CONSTRAINT spring_memory_notes_status_check
    CHECK (status IN (
      'active',
      'candidate',
      'archived',
      'deleted',
      'expired',      -- Auto-expired based on valid_to
      'superseded',   -- Replaced by newer information
      'invalidated',  -- Manually invalidated
      'denied'        -- Rejected by ingestion rules
    ));
EXCEPTION
  WHEN others THEN
    -- Constraint might not exist or have different name
    NULL;
END $$;

-- =============================================================================
-- 4. Temporal Query Indexes
-- =============================================================================

-- Index for validity-based queries
CREATE INDEX IF NOT EXISTS idx_spring_notes_validity
  ON spring_memory_notes (user_id, valid_from, valid_to)
  WHERE status = 'active';

-- Index for event-time queries (episodes)
CREATE INDEX IF NOT EXISTS idx_spring_notes_event_time
  ON spring_memory_notes (user_id, event_time)
  WHERE event_time IS NOT NULL;

-- Index for superseded lookups
CREATE INDEX IF NOT EXISTS idx_spring_notes_superseded_by
  ON spring_memory_notes (superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

-- Composite index for temporal status queries
CREATE INDEX IF NOT EXISTS idx_spring_notes_temporal_status
  ON spring_memory_notes (user_id, status, updated_at DESC)
  WHERE status IN ('expired', 'superseded', 'invalidated');

-- =============================================================================
-- 5. Helper Functions
-- =============================================================================

-- Function to process expired facts
CREATE OR REPLACE FUNCTION process_expired_facts(p_user_id TEXT DEFAULT NULL)
RETURNS TABLE (
  processed_count INTEGER,
  error_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_errors INTEGER := 0;
  v_note RECORD;
BEGIN
  FOR v_note IN
    SELECT id, user_id
    FROM spring_memory_notes
    WHERE status = 'active'
      AND valid_to IS NOT NULL
      AND valid_to < NOW()
      AND (p_user_id IS NULL OR user_id = p_user_id)
    LIMIT 100
  LOOP
    BEGIN
      -- Update status to expired
      UPDATE spring_memory_notes
      SET status = 'expired', updated_at = NOW()
      WHERE id = v_note.id;

      -- Record invalidation
      INSERT INTO spring_fact_invalidations (memory_id, reason, auto_invalidated)
      VALUES (v_note.id, 'Expired based on valid_to timestamp', TRUE);

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_errors;
END;
$$;

-- Function to get facts valid at a specific time
CREATE OR REPLACE FUNCTION get_facts_valid_at(
  p_user_id TEXT,
  p_valid_at TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type VARCHAR,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.content,
    n.note_type,
    n.valid_from,
    n.valid_to,
    n.created_at
  FROM spring_memory_notes n
  WHERE n.user_id = p_user_id
    AND n.status = 'active'
    AND (n.valid_from IS NULL OR n.valid_from <= p_valid_at)
    AND (n.valid_to IS NULL OR n.valid_to > p_valid_at)
  ORDER BY n.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Function to get temporal statistics
CREATE OR REPLACE FUNCTION get_temporal_stats(p_user_id TEXT)
RETURNS TABLE (
  status VARCHAR,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.status::VARCHAR,
    COUNT(*)::BIGINT
  FROM spring_memory_notes n
  WHERE n.user_id = p_user_id
  GROUP BY n.status;
END;
$$;

-- Function to find expiring-soon facts
CREATE OR REPLACE FUNCTION get_expiring_soon_facts(
  p_user_id TEXT,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  valid_to TIMESTAMPTZ,
  days_until_expiry INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.content,
    n.valid_to,
    EXTRACT(DAY FROM (n.valid_to - NOW()))::INTEGER AS days_until_expiry
  FROM spring_memory_notes n
  WHERE n.user_id = p_user_id
    AND n.status = 'active'
    AND n.valid_to IS NOT NULL
    AND n.valid_to > NOW()
    AND n.valid_to <= (NOW() + (p_days || ' days')::INTERVAL)
  ORDER BY n.valid_to ASC;
END;
$$;

-- =============================================================================
-- 6. Row Level Security
-- =============================================================================

ALTER TABLE spring_fact_invalidations ENABLE ROW LEVEL SECURITY;

-- Users can view invalidations of their memories
DROP POLICY IF EXISTS "Users can view their fact invalidations" ON spring_fact_invalidations;
CREATE POLICY "Users can view their fact invalidations"
  ON spring_fact_invalidations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM spring_memory_notes n
      WHERE n.id = memory_id AND n.user_id = auth.uid()::text
    )
  );

-- Service role bypass
DROP POLICY IF EXISTS "Service role has full access to fact invalidations" ON spring_fact_invalidations;
CREATE POLICY "Service role has full access to fact invalidations"
  ON spring_fact_invalidations FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- =============================================================================
-- 7. Comments
-- =============================================================================

COMMENT ON TABLE spring_fact_invalidations IS 'History of fact invalidations (expiry, supersession, manual)';
COMMENT ON COLUMN spring_memory_notes.superseded_by_id IS 'Reference to the memory that replaced this one';
COMMENT ON COLUMN spring_memory_notes.event_time IS 'When the event actually occurred (for episodes)';
COMMENT ON COLUMN spring_memory_notes.valid_from IS 'Start of validity period';
COMMENT ON COLUMN spring_memory_notes.valid_to IS 'End of validity period (auto-expires after)';
COMMENT ON FUNCTION process_expired_facts(TEXT) IS 'Process and expire facts past their valid_to date';
COMMENT ON FUNCTION get_facts_valid_at(TEXT, TIMESTAMPTZ, INTEGER) IS 'Get facts that were valid at a specific point in time';
COMMENT ON FUNCTION get_temporal_stats(TEXT) IS 'Get count of memories by status';
COMMENT ON FUNCTION get_expiring_soon_facts(TEXT, INTEGER) IS 'Get facts expiring within N days';
