-- Migration: Knowledge Gaps (#18)
-- Detect missing information when retrieval fails and suggest actions to fill gaps

-- ============================================================================
-- Detected knowledge gaps
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID,

  -- Gap identification
  query_text TEXT NOT NULL,
  query_embedding VECTOR(1536),
  gap_type TEXT NOT NULL CHECK (gap_type IN (
    'missing_entity',    -- Query mentions entities not in corpus
    'missing_table',     -- Query requests tabular data not present
    'outdated_doc',      -- Query references recent events, docs are old
    'permission_denied', -- Results exist but filtered by permissions
    'coverage_gap',      -- Topic exists but insufficient depth
    'domain_mismatch'    -- Query domain differs from collection focus
  )),

  -- Analysis results
  missing_entities JSONB DEFAULT '[]',      -- { name, type, confidence }[]
  suggested_sources JSONB DEFAULT '[]',     -- { source_type, url_or_id, priority, reason }[]
  related_docs JSONB DEFAULT '[]',          -- Docs that partially match
  confidence FLOAT DEFAULT 0.0,

  -- Analysis metadata
  analysis_version TEXT DEFAULT 'v1',
  analysis_metadata JSONB DEFAULT '{}',

  -- Actions
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
  resolution_action TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Deduplication
  query_hash TEXT GENERATED ALWAYS AS (encode(sha256(query_text::bytea), 'hex')) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Gap filling actions history
-- ============================================================================
CREATE TABLE IF NOT EXISTS gap_filling_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id UUID NOT NULL REFERENCES knowledge_gaps(id) ON DELETE CASCADE,

  action_type TEXT NOT NULL CHECK (action_type IN (
    'ingest_url',       -- Crawl and index a URL
    'ingest_file',      -- Upload and index a file
    'connect_source',   -- Add a federated source
    'request_access',   -- Request permission to existing doc
    'ignore'            -- Mark as not actionable
  )),

  -- Action configuration
  action_params JSONB NOT NULL DEFAULT '{}',

  -- Execution status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Results
  result JSONB DEFAULT '{}',
  error TEXT,

  -- Audit
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Gap occurrence tracking (for frequency analysis)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gap_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id UUID NOT NULL REFERENCES knowledge_gaps(id) ON DELETE CASCADE,

  -- The specific query that triggered this occurrence
  query_text TEXT NOT NULL,
  query_embedding VECTOR(1536),

  -- Context
  trace_id TEXT,
  session_id TEXT,

  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- knowledge_gaps indexes
CREATE INDEX idx_gaps_user ON knowledge_gaps(user_id);
CREATE INDEX idx_gaps_collection ON knowledge_gaps(collection_id);
CREATE INDEX idx_gaps_type ON knowledge_gaps(gap_type);
CREATE INDEX idx_gaps_status ON knowledge_gaps(status);
CREATE INDEX idx_gaps_created ON knowledge_gaps(created_at DESC);
CREATE INDEX idx_gaps_query_hash ON knowledge_gaps(query_hash);
CREATE INDEX idx_gaps_confidence ON knowledge_gaps(confidence DESC);

-- gap_filling_actions indexes
CREATE INDEX idx_actions_gap ON gap_filling_actions(gap_id);
CREATE INDEX idx_actions_type ON gap_filling_actions(action_type);
CREATE INDEX idx_actions_status ON gap_filling_actions(status);
CREATE INDEX idx_actions_created ON gap_filling_actions(created_at DESC);

-- gap_occurrences indexes
CREATE INDEX idx_occurrences_gap ON gap_occurrences(gap_id);
CREATE INDEX idx_occurrences_trace ON gap_occurrences(trace_id);
CREATE INDEX idx_occurrences_time ON gap_occurrences(occurred_at DESC);

-- Vector similarity search on gap embeddings (for deduplication)
CREATE INDEX idx_gaps_embedding ON knowledge_gaps
  USING ivfflat (query_embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE knowledge_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_filling_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_occurrences ENABLE ROW LEVEL SECURITY;

-- knowledge_gaps RLS
CREATE POLICY "Users own their gaps"
  ON knowledge_gaps
  FOR ALL
  USING (auth.uid() = user_id);

-- gap_filling_actions RLS (via gap ownership)
CREATE POLICY "Actions belong to user gaps"
  ON gap_filling_actions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_gaps
      WHERE id = gap_id AND user_id = auth.uid()
    )
  );

-- gap_occurrences RLS (via gap ownership)
CREATE POLICY "Occurrences belong to user gaps"
  ON gap_occurrences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_gaps
      WHERE id = gap_id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Update gap status when action completes
CREATE OR REPLACE FUNCTION update_gap_on_action_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Check if this resolves the gap
    IF NEW.result->>'resolved' = 'true' THEN
      UPDATE knowledge_gaps
      SET
        status = 'resolved',
        resolution_action = NEW.action_type,
        resolution_notes = NEW.result->>'notes',
        resolved_at = NOW(),
        resolved_by = NEW.initiated_by,
        updated_at = NOW()
      WHERE id = NEW.gap_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER gap_action_complete_trigger
  AFTER UPDATE ON gap_filling_actions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_gap_on_action_complete();

-- Increment occurrence count
CREATE OR REPLACE FUNCTION record_gap_occurrence()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the gap's updated_at to track activity
  UPDATE knowledge_gaps
  SET updated_at = NOW()
  WHERE id = NEW.gap_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER gap_occurrence_trigger
  AFTER INSERT ON gap_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION record_gap_occurrence();

-- Find similar existing gaps (for deduplication)
CREATE OR REPLACE FUNCTION find_similar_gaps(
  p_user_id UUID,
  p_query_embedding VECTOR(1536),
  p_threshold FLOAT DEFAULT 0.92,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  gap_id UUID,
  gap_type TEXT,
  status TEXT,
  similarity FLOAT,
  query_text TEXT,
  occurrence_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kg.id AS gap_id,
    kg.gap_type,
    kg.status,
    1 - (kg.query_embedding <=> p_query_embedding) AS similarity,
    kg.query_text,
    (SELECT COUNT(*) FROM gap_occurrences go WHERE go.gap_id = kg.id) AS occurrence_count
  FROM knowledge_gaps kg
  WHERE kg.user_id = p_user_id
    AND kg.query_embedding IS NOT NULL
    AND 1 - (kg.query_embedding <=> p_query_embedding) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get gap statistics for a user
CREATE OR REPLACE FUNCTION get_gap_statistics(p_user_id UUID)
RETURNS TABLE (
  total_gaps BIGINT,
  open_gaps BIGINT,
  resolved_gaps BIGINT,
  gap_type_counts JSONB,
  avg_resolution_time_hours FLOAT,
  most_common_entities JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH gap_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'open') AS open_count,
      COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
      jsonb_object_agg(gap_type, type_count) AS type_counts
    FROM knowledge_gaps
    WHERE user_id = p_user_id
    CROSS JOIN LATERAL (
      SELECT gap_type AS gt, COUNT(*) AS type_count
      FROM knowledge_gaps kg2
      WHERE kg2.user_id = p_user_id
      GROUP BY kg2.gap_type
    ) type_agg
  ),
  resolution_times AS (
    SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) AS avg_hours
    FROM knowledge_gaps
    WHERE user_id = p_user_id AND status = 'resolved'
  ),
  common_entities AS (
    SELECT jsonb_agg(jsonb_build_object('name', entity->>'name', 'count', count))
    FROM (
      SELECT entity, COUNT(*) AS count
      FROM knowledge_gaps kg,
           jsonb_array_elements(kg.missing_entities) AS entity
      WHERE kg.user_id = p_user_id
      GROUP BY entity->>'name', entity
      ORDER BY count DESC
      LIMIT 10
    ) top_entities
  )
  SELECT
    COALESCE(gs.total, 0),
    COALESCE(gs.open_count, 0),
    COALESCE(gs.resolved_count, 0),
    COALESCE(gs.type_counts, '{}'),
    rt.avg_hours,
    COALESCE((SELECT * FROM common_entities), '[]')
  FROM gap_stats gs
  CROSS JOIN resolution_times rt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE knowledge_gaps IS 'Detected knowledge gaps when retrieval fails or produces poor results';
COMMENT ON TABLE gap_filling_actions IS 'Actions taken to fill knowledge gaps (ingest, connect sources, etc.)';
COMMENT ON TABLE gap_occurrences IS 'Track how often each gap is encountered for prioritization';

COMMENT ON COLUMN knowledge_gaps.gap_type IS 'Type of knowledge gap: missing_entity, missing_table, outdated_doc, permission_denied, coverage_gap, domain_mismatch';
COMMENT ON COLUMN knowledge_gaps.missing_entities IS 'Entities mentioned in query but not found in corpus';
COMMENT ON COLUMN knowledge_gaps.suggested_sources IS 'Suggested sources to fill the gap';
COMMENT ON COLUMN knowledge_gaps.confidence IS 'Confidence score of the gap analysis (0-1)';

COMMENT ON COLUMN gap_filling_actions.action_type IS 'Type of action: ingest_url, ingest_file, connect_source, request_access, ignore';
COMMENT ON COLUMN gap_filling_actions.action_params IS 'Parameters for the action (URL, file path, source config, etc.)';
