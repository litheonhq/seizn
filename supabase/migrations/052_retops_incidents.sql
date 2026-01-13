-- Seizn RAG Sentry - Incident Triage + Auto RCA
-- Migration: 052_retops_incidents.sql
--
-- Tables:
-- - retops_incidents: Grouped failure/regression cases
-- - retops_incident_events: Timeline of incident events

-- ===========================================
-- 1) RetOps Incidents (Sentry-style grouping)
-- ===========================================
CREATE TABLE IF NOT EXISTS retops_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fingerprint for grouping similar issues
  fingerprint VARCHAR(128) NOT NULL,

  -- Ownership
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  collection_id UUID REFERENCES summer_collections(id) ON DELETE SET NULL,

  -- Issue information
  title TEXT NOT NULL,
  description TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),

  -- Root Cause Analysis
  rca_candidates JSONB DEFAULT '[]'::JSONB,
  -- Structure: [{cause: string, confidence: number, fix_suggestion: string, evidence: string[]}]

  error_type VARCHAR(50),
  -- Types: missing_context, low_faithfulness, timeout, policy_blocked,
  -- embedding_mismatch, rerank_failure, hallucination, stale_context

  -- Statistics
  occurrence_count INT NOT NULL DEFAULT 1,
  affected_traces JSONB DEFAULT '[]'::JSONB, -- trace_id array

  -- Sample data for debugging
  sample_query TEXT,
  sample_response TEXT,
  sample_trace_id UUID,

  -- Timestamps
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on user + fingerprint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_retops_incidents_fingerprint
  ON retops_incidents(user_id, fingerprint);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_retops_incidents_user_status
  ON retops_incidents(user_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_retops_incidents_collection
  ON retops_incidents(collection_id, status)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retops_incidents_severity
  ON retops_incidents(user_id, severity, status)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_retops_incidents_error_type
  ON retops_incidents(user_id, error_type)
  WHERE error_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retops_incidents_org
  ON retops_incidents(org_id, status)
  WHERE org_id IS NOT NULL;

-- ===========================================
-- 2) Incident Events (Timeline)
-- ===========================================
CREATE TABLE IF NOT EXISTS retops_incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES retops_incidents(id) ON DELETE CASCADE,

  -- Event source
  trace_id UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL,

  -- Event info
  event_type VARCHAR(50) NOT NULL,
  -- Types: created, occurrence, status_change, rca_updated, note_added, merged

  -- Event data
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- For occurrence: {query_hash, error_type, faithfulness_score, latency_ms}
  -- For status_change: {old_status, new_status, reason}
  -- For rca_updated: {rca_candidates}

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retops_incident_events_incident
  ON retops_incident_events(incident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retops_incident_events_trace
  ON retops_incident_events(trace_id)
  WHERE trace_id IS NOT NULL;

-- ===========================================
-- 3) RLS Policies
-- ===========================================
ALTER TABLE retops_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE retops_incident_events ENABLE ROW LEVEL SECURITY;

-- Incidents
CREATE POLICY "Users can view own retops_incidents"
  ON retops_incidents FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own retops_incidents"
  ON retops_incidents FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own retops_incidents"
  ON retops_incidents FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own retops_incidents"
  ON retops_incidents FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- Incident Events
CREATE POLICY "Users can view own retops_incident_events"
  ON retops_incident_events FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own retops_incident_events"
  ON retops_incident_events FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

-- ===========================================
-- 4) Helper Functions
-- ===========================================

-- Upsert incident (create or increment occurrence)
CREATE OR REPLACE FUNCTION upsert_incident(
  p_user_id TEXT,
  p_fingerprint VARCHAR(128),
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_severity VARCHAR(20) DEFAULT 'medium',
  p_error_type VARCHAR(50) DEFAULT NULL,
  p_collection_id UUID DEFAULT NULL,
  p_org_id UUID DEFAULT NULL,
  p_trace_id UUID DEFAULT NULL,
  p_sample_query TEXT DEFAULT NULL,
  p_rca_candidates JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID AS $$
DECLARE
  v_incident_id UUID;
  v_is_new BOOLEAN := FALSE;
BEGIN
  -- Try to find existing incident
  SELECT id INTO v_incident_id
  FROM retops_incidents
  WHERE user_id = p_user_id AND fingerprint = p_fingerprint
  FOR UPDATE;

  IF v_incident_id IS NULL THEN
    -- Create new incident
    INSERT INTO retops_incidents (
      user_id, fingerprint, title, description, severity,
      error_type, collection_id, org_id, sample_trace_id,
      sample_query, rca_candidates, occurrence_count,
      affected_traces
    ) VALUES (
      p_user_id, p_fingerprint, p_title, p_description, p_severity,
      p_error_type, p_collection_id, p_org_id, p_trace_id,
      p_sample_query, p_rca_candidates, 1,
      CASE WHEN p_trace_id IS NOT NULL THEN jsonb_build_array(p_trace_id) ELSE '[]'::JSONB END
    )
    RETURNING id INTO v_incident_id;
    v_is_new := TRUE;

    -- Create 'created' event
    INSERT INTO retops_incident_events (
      incident_id, user_id, trace_id, event_type, metadata
    ) VALUES (
      v_incident_id, p_user_id, p_trace_id, 'created',
      jsonb_build_object(
        'title', p_title,
        'severity', p_severity,
        'error_type', p_error_type
      )
    );
  ELSE
    -- Update existing incident
    UPDATE retops_incidents
    SET
      occurrence_count = occurrence_count + 1,
      last_seen_at = NOW(),
      updated_at = NOW(),
      affected_traces = CASE
        WHEN p_trace_id IS NOT NULL AND NOT (affected_traces @> jsonb_build_array(p_trace_id))
        THEN (
          SELECT jsonb_agg(t)
          FROM (
            SELECT jsonb_array_elements(affected_traces) AS t
            UNION ALL
            SELECT to_jsonb(p_trace_id)
            LIMIT 100  -- Keep only last 100 traces
          ) sub
        )
        ELSE affected_traces
      END,
      -- Update RCA if provided and different
      rca_candidates = CASE
        WHEN p_rca_candidates != '[]'::JSONB THEN p_rca_candidates
        ELSE rca_candidates
      END,
      -- Reopen if was resolved
      status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
    WHERE id = v_incident_id;

    -- Create 'occurrence' event
    INSERT INTO retops_incident_events (
      incident_id, user_id, trace_id, event_type, metadata
    ) VALUES (
      v_incident_id, p_user_id, p_trace_id, 'occurrence',
      jsonb_build_object('error_type', p_error_type)
    );
  END IF;

  RETURN v_incident_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve an incident
CREATE OR REPLACE FUNCTION resolve_incident(
  p_incident_id UUID,
  p_user_id TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_old_status VARCHAR(20);
BEGIN
  SELECT status INTO v_old_status
  FROM retops_incidents
  WHERE id = p_incident_id AND user_id = p_user_id;

  IF v_old_status IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Update incident
  UPDATE retops_incidents
  SET
    status = 'resolved',
    resolved_at = NOW(),
    resolved_by = p_user_id,
    resolution_notes = p_notes,
    updated_at = NOW()
  WHERE id = p_incident_id;

  -- Create status_change event
  INSERT INTO retops_incident_events (
    incident_id, user_id, event_type, metadata
  ) VALUES (
    p_incident_id, p_user_id, 'status_change',
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', 'resolved',
      'notes', p_notes
    )
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ignore an incident
CREATE OR REPLACE FUNCTION ignore_incident(
  p_incident_id UUID,
  p_user_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_old_status VARCHAR(20);
BEGIN
  SELECT status INTO v_old_status
  FROM retops_incidents
  WHERE id = p_incident_id AND user_id = p_user_id;

  IF v_old_status IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE retops_incidents
  SET
    status = 'ignored',
    resolution_notes = p_reason,
    updated_at = NOW()
  WHERE id = p_incident_id;

  INSERT INTO retops_incident_events (
    incident_id, user_id, event_type, metadata
  ) VALUES (
    p_incident_id, p_user_id, 'status_change',
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', 'ignored',
      'reason', p_reason
    )
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get incident summary for a user
CREATE OR REPLACE FUNCTION get_incident_summary(p_user_id TEXT)
RETURNS TABLE (
  total_incidents BIGINT,
  open_incidents BIGINT,
  critical_incidents BIGINT,
  high_incidents BIGINT,
  resolved_today BIGINT,
  new_today BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_incidents,
    COUNT(*) FILTER (WHERE status = 'open')::BIGINT AS open_incidents,
    COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical')::BIGINT AS critical_incidents,
    COUNT(*) FILTER (WHERE status = 'open' AND severity = 'high')::BIGINT AS high_incidents,
    COUNT(*) FILTER (WHERE resolved_at >= CURRENT_DATE)::BIGINT AS resolved_today,
    COUNT(*) FILTER (WHERE first_seen_at >= CURRENT_DATE)::BIGINT AS new_today
  FROM retops_incidents
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 5) Triggers
-- ===========================================

CREATE OR REPLACE FUNCTION update_retops_incidents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_retops_incidents_updated ON retops_incidents;
CREATE TRIGGER trigger_retops_incidents_updated
  BEFORE UPDATE ON retops_incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_retops_incidents_updated_at();

-- ===========================================
-- 6) Views
-- ===========================================

CREATE OR REPLACE VIEW retops_incidents_overview AS
SELECT
  user_id,
  status,
  severity,
  error_type,
  COUNT(*) AS incident_count,
  SUM(occurrence_count) AS total_occurrences,
  MAX(last_seen_at) AS last_activity
FROM retops_incidents
GROUP BY user_id, status, severity, error_type;

CREATE OR REPLACE VIEW retops_recent_incidents AS
SELECT
  i.*,
  (
    SELECT COUNT(*)
    FROM retops_incident_events e
    WHERE e.incident_id = i.id
  ) AS event_count
FROM retops_incidents i
WHERE i.last_seen_at >= NOW() - INTERVAL '7 days'
ORDER BY i.last_seen_at DESC;

GRANT SELECT ON retops_incidents_overview TO authenticated;
GRANT SELECT ON retops_recent_incidents TO authenticated;

-- ===========================================
-- 7) Comments
-- ===========================================
COMMENT ON TABLE retops_incidents IS 'Grouped failure/regression incidents for RAG Sentry';
COMMENT ON TABLE retops_incident_events IS 'Timeline of events for each incident';
COMMENT ON COLUMN retops_incidents.fingerprint IS 'Unique hash for grouping similar issues';
COMMENT ON COLUMN retops_incidents.rca_candidates IS 'Root cause analysis candidates with confidence scores';
COMMENT ON COLUMN retops_incidents.error_type IS 'Categorized error type for filtering';
COMMENT ON FUNCTION upsert_incident IS 'Create or update incident with auto-grouping by fingerprint';
COMMENT ON FUNCTION resolve_incident IS 'Mark incident as resolved with notes';
COMMENT ON FUNCTION ignore_incident IS 'Mark incident as ignored';
COMMENT ON FUNCTION get_incident_summary IS 'Get summary statistics for user incidents';
