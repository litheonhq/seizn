-- Migration: Memory Provenance
-- Tracks the source and origin of each memory for transparency and debugging
-- Part of Memory OS - Provenance tracking system

-- ===========================================
-- 1. Memory Provenance Table
-- ===========================================

CREATE TABLE IF NOT EXISTS memory_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- Source identification
  source_type TEXT NOT NULL CHECK (source_type IN (
    'conversation',  -- From chat/dialogue
    'document',      -- From uploaded document
    'image',         -- From image analysis
    'api',           -- From external API call
    'system'         -- System-generated (decay, merge, etc.)
  )),
  source_id TEXT,                    -- conversation_id, document_chunk_id, etc.
  source_metadata JSONB DEFAULT '{}', -- Additional context (e.g., page number, timestamp, model used)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 2. Indexes
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_memory_provenance_memory_id
  ON memory_provenance(memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_provenance_source_type
  ON memory_provenance(source_type);

CREATE INDEX IF NOT EXISTS idx_memory_provenance_source_id
  ON memory_provenance(source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_provenance_created_at
  ON memory_provenance(created_at DESC);

-- ===========================================
-- 3. Row Level Security
-- ===========================================

ALTER TABLE memory_provenance ENABLE ROW LEVEL SECURITY;

-- Users can view provenance for their own memories
CREATE POLICY "Users can view provenance for own memories"
  ON memory_provenance FOR SELECT
  USING (
    memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can insert provenance for their own memories
CREATE POLICY "Users can insert provenance for own memories"
  ON memory_provenance FOR INSERT
  WITH CHECK (
    memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can update provenance for their own memories
CREATE POLICY "Users can update provenance for own memories"
  ON memory_provenance FOR UPDATE
  USING (
    memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can delete provenance for their own memories
CREATE POLICY "Users can delete provenance for own memories"
  ON memory_provenance FOR DELETE
  USING (
    memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Service role bypass for system operations
CREATE POLICY "Service role has full access to provenance"
  ON memory_provenance FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ===========================================
-- 4. Helper Functions
-- ===========================================

-- Function to get full provenance chain for a memory
CREATE OR REPLACE FUNCTION get_memory_provenance(p_memory_id UUID)
RETURNS TABLE (
  provenance_id UUID,
  source_type TEXT,
  source_id TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mp.id,
    mp.source_type,
    mp.source_id,
    mp.source_metadata,
    mp.created_at
  FROM memory_provenance mp
  WHERE mp.memory_id = p_memory_id
  ORDER BY mp.created_at ASC;
END;
$$;

-- ===========================================
-- 5. Comments
-- ===========================================

COMMENT ON TABLE memory_provenance IS 'Tracks the source and origin of each memory for transparency, debugging, and audit purposes';
COMMENT ON COLUMN memory_provenance.source_type IS 'Type of source: conversation, document, image, api, or system';
COMMENT ON COLUMN memory_provenance.source_id IS 'Identifier of the source (e.g., conversation_id, document_chunk_id)';
COMMENT ON COLUMN memory_provenance.source_metadata IS 'Additional context like page number, timestamp, model used, extraction confidence';
-- Migration: Memory Policy Decisions
-- Logs all storage/deletion/masking decisions for audit and compliance
-- Part of Memory OS - Governance and audit system

-- ===========================================
-- 1. Memory Policy Decisions Table
-- ===========================================

CREATE TABLE IF NOT EXISTS memory_policy_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL, -- Nullable: may not exist if rejected
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

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
  USING (user_id = auth.uid());

-- Users can insert their own policy decisions (typically via API)
CREATE POLICY "Users can insert own policy decisions"
  ON memory_policy_decisions FOR INSERT
  WITH CHECK (user_id = auth.uid());

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
  p_user_id UUID,
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
  p_user_id UUID,
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
  p_user_id UUID,
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
-- Migration: Memory Edges
-- Stores relationships between memories for graph-based retrieval
-- Part of Memory OS - Knowledge graph structure

-- ===========================================
-- 1. Memory Edges Table
-- ===========================================

CREATE TABLE IF NOT EXISTS memory_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- Edge properties
  edge_type TEXT NOT NULL CHECK (edge_type IN (
    'entity_link',    -- Same entity mentioned in both memories
    'topic_link',     -- Same topic/concept
    'causal',         -- Cause-effect relationship
    'temporal',       -- Temporal sequence relationship
    'contradiction',  -- Contradictory information
    'elaboration',    -- One memory elaborates on another
    'reference',      -- One memory references another
    'derived',        -- One memory is derived from another
    'similar'         -- High semantic similarity
  )),

  weight FLOAT DEFAULT 1.0 CHECK (weight >= 0.0 AND weight <= 1.0), -- Edge strength (0-1)

  -- Additional context
  metadata JSONB DEFAULT '{}', -- Entity name, similarity score, etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate edges of the same type between same memories
  CONSTRAINT unique_memory_edge UNIQUE (source_memory_id, target_memory_id, edge_type)
);

-- ===========================================
-- 2. Indexes
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_memory_edges_source
  ON memory_edges(source_memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_edges_target
  ON memory_edges(target_memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_edges_type
  ON memory_edges(edge_type);

CREATE INDEX IF NOT EXISTS idx_memory_edges_weight
  ON memory_edges(weight DESC);

CREATE INDEX IF NOT EXISTS idx_memory_edges_source_type
  ON memory_edges(source_memory_id, edge_type);

CREATE INDEX IF NOT EXISTS idx_memory_edges_target_type
  ON memory_edges(target_memory_id, edge_type);

CREATE INDEX IF NOT EXISTS idx_memory_edges_created_at
  ON memory_edges(created_at DESC);

-- ===========================================
-- 3. Row Level Security
-- ===========================================

ALTER TABLE memory_edges ENABLE ROW LEVEL SECURITY;

-- Users can view edges where they own the source memory
CREATE POLICY "Users can view edges for own memories"
  ON memory_edges FOR SELECT
  USING (
    source_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
    OR target_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can insert edges between their own memories
CREATE POLICY "Users can insert edges between own memories"
  ON memory_edges FOR INSERT
  WITH CHECK (
    source_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
    AND target_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can update edges for their own memories
CREATE POLICY "Users can update edges for own memories"
  ON memory_edges FOR UPDATE
  USING (
    source_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can delete edges for their own memories
CREATE POLICY "Users can delete edges for own memories"
  ON memory_edges FOR DELETE
  USING (
    source_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Service role bypass for system operations
CREATE POLICY "Service role has full access to memory edges"
  ON memory_edges FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ===========================================
-- 4. Helper Functions
-- ===========================================

-- Function to get all connected memories (1 hop)
CREATE OR REPLACE FUNCTION get_connected_memories(
  p_memory_id UUID,
  p_edge_types TEXT[] DEFAULT NULL,
  p_min_weight FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  memory_id UUID,
  edge_type TEXT,
  weight FLOAT,
  direction TEXT, -- 'outgoing' or 'incoming'
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Outgoing edges
  SELECT
    me.target_memory_id AS memory_id,
    me.edge_type,
    me.weight,
    'outgoing'::TEXT AS direction,
    me.metadata
  FROM memory_edges me
  WHERE me.source_memory_id = p_memory_id
    AND me.weight >= p_min_weight
    AND (p_edge_types IS NULL OR me.edge_type = ANY(p_edge_types))

  UNION ALL

  -- Incoming edges
  SELECT
    me.source_memory_id AS memory_id,
    me.edge_type,
    me.weight,
    'incoming'::TEXT AS direction,
    me.metadata
  FROM memory_edges me
  WHERE me.target_memory_id = p_memory_id
    AND me.weight >= p_min_weight
    AND (p_edge_types IS NULL OR me.edge_type = ANY(p_edge_types))

  ORDER BY weight DESC;
END;
$$;

-- Function to create or update an edge (upsert)
CREATE OR REPLACE FUNCTION upsert_memory_edge(
  p_source_memory_id UUID,
  p_target_memory_id UUID,
  p_edge_type TEXT,
  p_weight FLOAT DEFAULT 1.0,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_edge_id UUID;
BEGIN
  INSERT INTO memory_edges (
    source_memory_id,
    target_memory_id,
    edge_type,
    weight,
    metadata
  ) VALUES (
    p_source_memory_id,
    p_target_memory_id,
    p_edge_type,
    p_weight,
    p_metadata
  )
  ON CONFLICT (source_memory_id, target_memory_id, edge_type)
  DO UPDATE SET
    weight = EXCLUDED.weight,
    metadata = EXCLUDED.metadata
  RETURNING id INTO v_edge_id;

  RETURN v_edge_id;
END;
$$;

-- Function to get edge statistics for a user
CREATE OR REPLACE FUNCTION get_memory_graph_stats(p_user_id UUID)
RETURNS TABLE (
  edge_type TEXT,
  edge_count BIGINT,
  avg_weight FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.edge_type,
    COUNT(*)::BIGINT AS edge_count,
    AVG(me.weight)::FLOAT AS avg_weight
  FROM memory_edges me
  JOIN memories m ON me.source_memory_id = m.id
  WHERE m.user_id = p_user_id
  GROUP BY me.edge_type
  ORDER BY edge_count DESC;
END;
$$;

-- Function to find paths between two memories (max 3 hops)
CREATE OR REPLACE FUNCTION find_memory_path(
  p_source_id UUID,
  p_target_id UUID,
  p_max_depth INTEGER DEFAULT 3
)
RETURNS TABLE (
  path UUID[],
  edge_types TEXT[],
  total_weight FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE paths AS (
    -- Base case: direct edges
    SELECT
      ARRAY[source_memory_id, target_memory_id] AS path,
      ARRAY[edge_type] AS edge_types,
      weight AS total_weight,
      1 AS depth
    FROM memory_edges
    WHERE source_memory_id = p_source_id

    UNION ALL

    -- Recursive case: extend paths
    SELECT
      p.path || me.target_memory_id,
      p.edge_types || me.edge_type,
      p.total_weight + me.weight,
      p.depth + 1
    FROM paths p
    JOIN memory_edges me ON me.source_memory_id = p.path[array_length(p.path, 1)]
    WHERE p.depth < p_max_depth
      AND NOT me.target_memory_id = ANY(p.path) -- Prevent cycles
  )
  SELECT
    p.path,
    p.edge_types,
    p.total_weight
  FROM paths p
  WHERE p.path[array_length(p.path, 1)] = p_target_id
  ORDER BY p.total_weight DESC
  LIMIT 10;
END;
$$;

-- ===========================================
-- 5. Comments
-- ===========================================

COMMENT ON TABLE memory_edges IS 'Graph edges representing relationships between memories';
COMMENT ON COLUMN memory_edges.source_memory_id IS 'The memory where the relationship originates';
COMMENT ON COLUMN memory_edges.target_memory_id IS 'The memory where the relationship points to';
COMMENT ON COLUMN memory_edges.edge_type IS 'Type of relationship: entity_link, topic_link, causal, temporal, contradiction, etc.';
COMMENT ON COLUMN memory_edges.weight IS 'Strength of the relationship (0.0 to 1.0)';
COMMENT ON COLUMN memory_edges.metadata IS 'Additional context like entity name, similarity score, or extraction details';
-- Seizn Fall - Flight Recorder MVP Enhancement
-- Migration: 040_flight_recorder.sql
--
-- Extends fall_retrieval_traces with:
-- - Enhanced trace structure (spans, cost, result_stats)
-- - Replay tracking
-- - Better indexing for filtering and search

-- ===========================================
-- 1) Add new columns to fall_retrieval_traces
-- ===========================================

-- Add replay_of column to track trace replay chains
ALTER TABLE fall_retrieval_traces
ADD COLUMN IF NOT EXISTS replay_of UUID REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL;

-- Add source column to track where the request originated
ALTER TABLE fall_retrieval_traces
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'api';

-- Add client_version column for SDK version tracking
ALTER TABLE fall_retrieval_traces
ADD COLUMN IF NOT EXISTS client_version TEXT;

-- ===========================================
-- 2) Create indexes for common query patterns
-- ===========================================

-- Index for finding replays of a trace
CREATE INDEX IF NOT EXISTS idx_fall_traces_replay_of
ON fall_retrieval_traces(replay_of)
WHERE replay_of IS NOT NULL;

-- Index for filtering by error
CREATE INDEX IF NOT EXISTS idx_fall_traces_error
ON fall_retrieval_traces(user_id, created_at DESC)
WHERE error IS NOT NULL;

-- Index for experiment filtering
CREATE INDEX IF NOT EXISTS idx_fall_traces_experiment
ON fall_retrieval_traces(experiment_id, created_at DESC)
WHERE experiment_id IS NOT NULL;

-- Index for full-text search on query_text
CREATE INDEX IF NOT EXISTS idx_fall_traces_query_text_gin
ON fall_retrieval_traces USING GIN (to_tsvector('english', COALESCE(query_text, '')));

-- ===========================================
-- 3) Create trace statistics view
-- ===========================================

CREATE OR REPLACE VIEW fall_trace_stats AS
SELECT
  user_id,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS trace_count,
  COUNT(*) FILTER (WHERE error IS NOT NULL) AS error_count,
  AVG((timings_ms->>'total')::NUMERIC) AS avg_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (timings_ms->>'total')::NUMERIC) AS p95_latency_ms,
  SUM((trace->'cost'->>'total')::NUMERIC) AS total_cost_usd
FROM fall_retrieval_traces
WHERE sampled = true
GROUP BY user_id, DATE_TRUNC('day', created_at);

-- ===========================================
-- 4) Create function to get replay chain
-- ===========================================

CREATE OR REPLACE FUNCTION get_trace_replay_chain(
  p_trace_id UUID,
  p_user_id TEXT
)
RETURNS TABLE (
  id UUID,
  request_id UUID,
  created_at TIMESTAMPTZ,
  replay_of UUID,
  timings_ms JSONB,
  results_count INT,
  effective_config JSONB,
  trace JSONB,
  is_root BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_root_id UUID;
BEGIN
  -- Find the root trace (the one without replay_of or the ultimate parent)
  WITH RECURSIVE chain AS (
    -- Start with the given trace
    SELECT t.id, t.replay_of, 0 AS depth
    FROM fall_retrieval_traces t
    WHERE t.id = p_trace_id AND t.user_id = p_user_id

    UNION ALL

    -- Recursively find parents
    SELECT t.id, t.replay_of, c.depth + 1
    FROM fall_retrieval_traces t
    JOIN chain c ON t.id = c.replay_of
    WHERE t.user_id = p_user_id AND c.depth < 10 -- Prevent infinite loops
  )
  SELECT c.id INTO v_root_id
  FROM chain c
  WHERE c.replay_of IS NULL
  LIMIT 1;

  -- If no root found, use the original trace
  IF v_root_id IS NULL THEN
    v_root_id := p_trace_id;
  END IF;

  -- Return all traces in the chain (root + all its replays)
  RETURN QUERY
  SELECT
    t.id,
    t.request_id,
    t.created_at,
    t.replay_of,
    t.timings_ms,
    t.results_count,
    t.effective_config,
    t.trace,
    (t.id = v_root_id) AS is_root
  FROM fall_retrieval_traces t
  WHERE t.user_id = p_user_id
    AND (t.id = v_root_id OR t.replay_of = v_root_id)
  ORDER BY t.created_at ASC;
END;
$$;

-- ===========================================
-- 5) Create function to compare traces
-- ===========================================

CREATE OR REPLACE FUNCTION compare_traces(
  p_trace_id_a UUID,
  p_trace_id_b UUID,
  p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trace_a RECORD;
  v_trace_b RECORD;
  v_result_ids_a TEXT[];
  v_result_ids_b TEXT[];
  v_overlap TEXT[];
  v_only_a TEXT[];
  v_only_b TEXT[];
BEGIN
  -- Fetch both traces
  SELECT * INTO v_trace_a
  FROM fall_retrieval_traces
  WHERE id = p_trace_id_a AND user_id = p_user_id;

  SELECT * INTO v_trace_b
  FROM fall_retrieval_traces
  WHERE id = p_trace_id_b AND user_id = p_user_id;

  IF v_trace_a IS NULL OR v_trace_b IS NULL THEN
    RETURN NULL;
  END IF;

  -- Extract result IDs from traces
  SELECT ARRAY_AGG(doc_id) INTO v_result_ids_a
  FROM jsonb_array_elements_text(
    COALESCE(v_trace_a.trace->'result_stats'->'documentIds', '[]'::JSONB)
  ) AS doc_id;

  SELECT ARRAY_AGG(doc_id) INTO v_result_ids_b
  FROM jsonb_array_elements_text(
    COALESCE(v_trace_b.trace->'result_stats'->'documentIds', '[]'::JSONB)
  ) AS doc_id;

  -- Calculate overlap
  v_overlap := COALESCE(v_result_ids_a, '{}') & COALESCE(v_result_ids_b, '{}');
  v_only_a := COALESCE(v_result_ids_a, '{}') - COALESCE(v_result_ids_b, '{}');
  v_only_b := COALESCE(v_result_ids_b, '{}') - COALESCE(v_result_ids_a, '{}');

  RETURN jsonb_build_object(
    'trace_a', jsonb_build_object(
      'id', v_trace_a.id,
      'created_at', v_trace_a.created_at,
      'results_count', v_trace_a.results_count,
      'timings_ms', v_trace_a.timings_ms
    ),
    'trace_b', jsonb_build_object(
      'id', v_trace_b.id,
      'created_at', v_trace_b.created_at,
      'results_count', v_trace_b.results_count,
      'timings_ms', v_trace_b.timings_ms
    ),
    'results', jsonb_build_object(
      'overlap_count', COALESCE(array_length(v_overlap, 1), 0),
      'only_in_a_count', COALESCE(array_length(v_only_a, 1), 0),
      'only_in_b_count', COALESCE(array_length(v_only_b, 1), 0)
    ),
    'latency_delta_ms', (
      COALESCE((v_trace_b.timings_ms->>'total')::NUMERIC, 0) -
      COALESCE((v_trace_a.timings_ms->>'total')::NUMERIC, 0)
    ),
    'cost_delta_usd', (
      COALESCE((v_trace_b.trace->'cost'->>'total')::NUMERIC, 0) -
      COALESCE((v_trace_a.trace->'cost'->>'total')::NUMERIC, 0)
    )
  );
END;
$$;

-- ===========================================
-- 6) Add RLS policy for replay_of access
-- ===========================================

-- Allow users to read traces they replay from (even if not their own user_id in edge cases)
-- This is already covered by the existing policy since we check user_id

-- ===========================================
-- 7) Create cleanup function for old traces
-- ===========================================

CREATE OR REPLACE FUNCTION cleanup_old_traces(
  p_retention_days INT DEFAULT 30,
  p_batch_size INT DEFAULT 1000
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH deleted AS (
    DELETE FROM fall_retrieval_traces
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL
      AND id IN (
        SELECT id FROM fall_retrieval_traces
        WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL
        LIMIT p_batch_size
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

-- ===========================================
-- 8) Create trace search function
-- ===========================================

CREATE OR REPLACE FUNCTION search_traces(
  p_user_id TEXT,
  p_query TEXT DEFAULT NULL,
  p_collection_id UUID DEFAULT NULL,
  p_has_error BOOLEAN DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  request_id UUID,
  query_text TEXT,
  collection_id UUID,
  effective_config JSONB,
  timings_ms JSONB,
  results_count INT,
  error TEXT,
  trace JSONB,
  created_at TIMESTAMPTZ,
  replay_of UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.request_id,
    t.query_text,
    t.collection_id,
    t.effective_config,
    t.timings_ms,
    t.results_count,
    t.error,
    t.trace,
    t.created_at,
    t.replay_of
  FROM fall_retrieval_traces t
  WHERE t.user_id = p_user_id
    AND (p_query IS NULL OR t.query_text ILIKE '%' || p_query || '%')
    AND (p_collection_id IS NULL OR t.collection_id = p_collection_id)
    AND (p_has_error IS NULL OR (p_has_error = TRUE AND t.error IS NOT NULL) OR (p_has_error = FALSE AND t.error IS NULL))
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
  ORDER BY t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ===========================================
-- 9) Grant permissions
-- ===========================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_trace_replay_chain(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION compare_traces(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_traces(TEXT, TEXT, UUID, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated;

-- Grant select on the stats view
GRANT SELECT ON fall_trace_stats TO authenticated;

-- ===========================================
-- 10) Comments for documentation
-- ===========================================

COMMENT ON COLUMN fall_retrieval_traces.replay_of IS 'Reference to the original trace this was replayed from';
COMMENT ON COLUMN fall_retrieval_traces.source IS 'Source of the request: api, sdk, dashboard, playground';
COMMENT ON COLUMN fall_retrieval_traces.client_version IS 'Client SDK version for debugging';

COMMENT ON FUNCTION get_trace_replay_chain(UUID, TEXT) IS 'Get all traces in a replay chain (original + all replays)';
COMMENT ON FUNCTION compare_traces(UUID, UUID, TEXT) IS 'Compare two traces and return diff summary';
COMMENT ON FUNCTION search_traces(TEXT, TEXT, UUID, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) IS 'Search traces with filters';
COMMENT ON FUNCTION cleanup_old_traces(INT, INT) IS 'Delete traces older than retention period';

COMMENT ON VIEW fall_trace_stats IS 'Daily aggregated trace statistics per user';
-- Seizn Fall - Enhanced Evaluation Pipeline
-- Migration: 041_eval_pipeline.sql
-- Adds extended evaluation metrics support and dataset management

-- ===========================================
-- 1) Extend fall_eval_datasets
-- ===========================================

-- Add source column to track dataset origin
ALTER TABLE fall_eval_datasets
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Add case count for quick reference
ALTER TABLE fall_eval_datasets
  ADD COLUMN IF NOT EXISTS case_count INTEGER DEFAULT 0;

-- Add metadata column if not exists
ALTER TABLE fall_eval_datasets
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Create index for source filtering
CREATE INDEX IF NOT EXISTS idx_fall_eval_datasets_source
ON fall_eval_datasets(user_id, source);

-- ===========================================
-- 2) Extend fall_eval_cases
-- ===========================================

-- Add relevance_scores for graded relevance (NDCG)
ALTER TABLE fall_eval_cases
  ADD COLUMN IF NOT EXISTS relevance_scores FLOAT[] NULL;

-- Create index for faster case lookups
CREATE INDEX IF NOT EXISTS idx_fall_eval_cases_user_dataset
ON fall_eval_cases(user_id, dataset_id);

-- ===========================================
-- 3) Extend fall_eval_runs
-- ===========================================

-- Add duration tracking
ALTER TABLE fall_eval_runs
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER NULL;

-- ===========================================
-- 4) Extend fall_eval_results
-- ===========================================

-- Ensure debug column exists
ALTER TABLE fall_eval_results
  ADD COLUMN IF NOT EXISTS debug JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Create index for run results lookup
CREATE INDEX IF NOT EXISTS idx_fall_eval_results_case
ON fall_eval_results(case_id);

-- ===========================================
-- 5) Create regression events table
-- ===========================================

CREATE TABLE IF NOT EXISTS fall_eval_regression_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES fall_eval_datasets(id) ON DELETE CASCADE,

  baseline_run_id UUID NOT NULL REFERENCES fall_eval_runs(id) ON DELETE CASCADE,
  candidate_run_id UUID NOT NULL REFERENCES fall_eval_runs(id) ON DELETE CASCADE,

  metric_key TEXT NOT NULL,
  baseline_value FLOAT NOT NULL,
  candidate_value FLOAT NOT NULL,
  delta FLOAT NOT NULL,

  severity TEXT NOT NULL DEFAULT 'warning', -- warning|critical
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for regression events
CREATE INDEX IF NOT EXISTS idx_fall_eval_regression_events_user
ON fall_eval_regression_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_eval_regression_events_dataset
ON fall_eval_regression_events(dataset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_eval_regression_events_unack
ON fall_eval_regression_events(user_id, acknowledged) WHERE acknowledged = FALSE;

-- ===========================================
-- 6) Create eval reports table (optional)
-- ===========================================

CREATE TABLE IF NOT EXISTS fall_eval_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES fall_eval_runs(id) ON DELETE CASCADE,

  format TEXT NOT NULL DEFAULT 'json', -- json|csv|markdown|html
  title TEXT NULL,

  -- Store report configuration
  config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Comparison data if baseline was provided
  baseline_run_id UUID NULL REFERENCES fall_eval_runs(id) ON DELETE SET NULL,
  comparison_delta JSONB NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_eval_reports_run
ON fall_eval_reports(run_id);

CREATE INDEX IF NOT EXISTS idx_fall_eval_reports_user
ON fall_eval_reports(user_id, created_at DESC);

-- ===========================================
-- 7) RLS Policies
-- ===========================================

ALTER TABLE fall_eval_regression_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_eval_reports ENABLE ROW LEVEL SECURITY;

-- Regression events policies
CREATE POLICY "Users can view own fall_eval_regression_events"
  ON fall_eval_regression_events FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own fall_eval_regression_events"
  ON fall_eval_regression_events FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own fall_eval_regression_events"
  ON fall_eval_regression_events FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

-- Reports policies
CREATE POLICY "Users can view own fall_eval_reports"
  ON fall_eval_reports FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own fall_eval_reports"
  ON fall_eval_reports FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

-- ===========================================
-- 8) Helper function for dataset case count
-- ===========================================

CREATE OR REPLACE FUNCTION update_eval_dataset_case_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE fall_eval_datasets
    SET case_count = (
      SELECT COUNT(*) FROM fall_eval_cases
      WHERE dataset_id = NEW.dataset_id
    ),
    updated_at = NOW()
    WHERE id = NEW.dataset_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE fall_eval_datasets
    SET case_count = (
      SELECT COUNT(*) FROM fall_eval_cases
      WHERE dataset_id = OLD.dataset_id
    ),
    updated_at = NOW()
    WHERE id = OLD.dataset_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_update_eval_dataset_case_count ON fall_eval_cases;

CREATE TRIGGER trg_update_eval_dataset_case_count
AFTER INSERT OR DELETE ON fall_eval_cases
FOR EACH ROW
EXECUTE FUNCTION update_eval_dataset_case_count();

-- ===========================================
-- 9) Backfill existing datasets with case counts
-- ===========================================

UPDATE fall_eval_datasets d
SET case_count = (
  SELECT COUNT(*) FROM fall_eval_cases c
  WHERE c.dataset_id = d.id
)
WHERE case_count IS NULL OR case_count = 0;
-- Migration: Summer Documents Enhanced Indexing
-- Adds columns and functions for the enhanced /index API

-- ============================================
-- 1. Add columns to summer_documents
-- ============================================

-- Add chunking_strategy column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'chunking_strategy'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN chunking_strategy VARCHAR(50) DEFAULT 'sliding_window';
  END IF;
END $$;

-- Add embedding_model column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'embedding_model'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN embedding_model VARCHAR(50) DEFAULT 'voyage-3';
  END IF;
END $$;

-- Add chunk_count column (denormalized for quick access)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'chunk_count'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN chunk_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add total_tokens column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'total_tokens'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN total_tokens INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add mime_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'mime_type'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN mime_type VARCHAR(100);
  END IF;
END $$;

-- Add status column (for async processing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'status'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN status VARCHAR(20) DEFAULT 'indexed'
      CHECK (status IN ('pending', 'processing', 'indexed', 'failed'));
  END IF;
END $$;

-- Add error_message column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN error_message TEXT;
  END IF;
END $$;

-- ============================================
-- 2. Add columns to summer_chunks
-- ============================================

-- Add start_offset column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_chunks' AND column_name = 'start_offset'
  ) THEN
    ALTER TABLE summer_chunks ADD COLUMN start_offset INTEGER;
  END IF;
END $$;

-- Add end_offset column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_chunks' AND column_name = 'end_offset'
  ) THEN
    ALTER TABLE summer_chunks ADD COLUMN end_offset INTEGER;
  END IF;
END $$;

-- ============================================
-- 3. Create indexes for new columns
-- ============================================

CREATE INDEX IF NOT EXISTS idx_summer_documents_status
  ON summer_documents(status) WHERE status != 'indexed';

CREATE INDEX IF NOT EXISTS idx_summer_documents_content_hash
  ON summer_documents(content_hash) WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_summer_chunks_offsets
  ON summer_chunks(document_id, start_offset, end_offset)
  WHERE start_offset IS NOT NULL;

-- ============================================
-- 4. Indexing statistics view
-- ============================================

CREATE OR REPLACE VIEW summer_indexing_stats AS
SELECT
  c.id AS collection_id,
  c.name AS collection_name,
  c.user_id,
  COUNT(DISTINCT d.id) AS document_count,
  COUNT(ch.id) AS chunk_count,
  COALESCE(SUM(d.total_tokens), 0) AS total_tokens,
  COALESCE(AVG(ch.token_count), 0) AS avg_chunk_tokens,
  MIN(d.created_at) AS first_indexed_at,
  MAX(d.updated_at) AS last_updated_at
FROM summer_collections c
LEFT JOIN summer_documents d ON d.collection_id = c.id
LEFT JOIN summer_chunks ch ON ch.document_id = d.id
GROUP BY c.id, c.name, c.user_id;

COMMENT ON VIEW summer_indexing_stats IS 'Aggregated indexing statistics per collection';

-- ============================================
-- 5. Function to update document chunk count
-- ============================================

CREATE OR REPLACE FUNCTION update_document_chunk_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE summer_documents
    SET chunk_count = chunk_count + 1,
        total_tokens = total_tokens + COALESCE(NEW.token_count, 0)
    WHERE id = NEW.document_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE summer_documents
    SET chunk_count = GREATEST(0, chunk_count - 1),
        total_tokens = GREATEST(0, total_tokens - COALESCE(OLD.token_count, 0))
    WHERE id = OLD.document_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS summer_chunk_count_trigger ON summer_chunks;
CREATE TRIGGER summer_chunk_count_trigger
  AFTER INSERT OR DELETE ON summer_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_document_chunk_count();

-- ============================================
-- 6. Function to get document with chunks
-- ============================================

CREATE OR REPLACE FUNCTION get_document_with_chunks(
  p_document_id UUID,
  p_user_id TEXT
)
RETURNS TABLE (
  document_id UUID,
  external_id TEXT,
  title TEXT,
  source TEXT,
  status VARCHAR(20),
  chunk_count INTEGER,
  total_tokens INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  chunks JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS document_id,
    d.external_id,
    d.title,
    d.source,
    d.status,
    d.chunk_count,
    d.total_tokens,
    d.created_at,
    d.updated_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'chunk_id', c.id,
            'chunk_index', c.chunk_index,
            'content', c.content,
            'token_count', c.token_count,
            'start_offset', c.start_offset,
            'end_offset', c.end_offset
          ) ORDER BY c.chunk_index
        )
        FROM summer_chunks c
        WHERE c.document_id = d.id
      ),
      '[]'::jsonb
    ) AS chunks
  FROM summer_documents d
  WHERE d.id = p_document_id
    AND d.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Function to bulk delete documents
-- ============================================

CREATE OR REPLACE FUNCTION bulk_delete_documents(
  p_document_ids UUID[],
  p_user_id TEXT
)
RETURNS TABLE (
  deleted_count INTEGER,
  chunks_deleted INTEGER
) AS $$
DECLARE
  v_deleted_count INTEGER;
  v_chunks_deleted INTEGER;
BEGIN
  -- Count chunks to be deleted
  SELECT COUNT(*) INTO v_chunks_deleted
  FROM summer_chunks c
  JOIN summer_documents d ON c.document_id = d.id
  WHERE d.id = ANY(p_document_ids)
    AND d.user_id = p_user_id;

  -- Delete documents (chunks will cascade)
  WITH deleted AS (
    DELETE FROM summer_documents
    WHERE id = ANY(p_document_ids)
      AND user_id = p_user_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  RETURN QUERY SELECT v_deleted_count, v_chunks_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. Function to search chunks with document info
-- ============================================

CREATE OR REPLACE FUNCTION summer_search_chunks_with_docs(
  query_embedding vector(1024),
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  search_ef INT DEFAULT 40
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  external_id TEXT,
  document_title TEXT,
  document_source TEXT,
  content TEXT,
  chunk_index INT,
  metadata JSONB,
  similarity FLOAT,
  start_offset INT,
  end_offset INT
) AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    d.external_id,
    d.title AS document_title,
    d.source AS document_source,
    c.content,
    c.chunk_index,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity,
    c.start_offset,
    c.end_offset
  FROM summer_chunks c
  JOIN summer_documents d ON c.document_id = d.id
  WHERE c.user_id = match_user_id
    AND c.collection_id = match_collection_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. Initialize existing documents
-- ============================================

-- Update chunk_count for existing documents
UPDATE summer_documents d
SET chunk_count = (
  SELECT COUNT(*) FROM summer_chunks c WHERE c.document_id = d.id
),
total_tokens = (
  SELECT COALESCE(SUM(token_count), 0) FROM summer_chunks c WHERE c.document_id = d.id
)
WHERE d.chunk_count IS NULL OR d.chunk_count = 0;

-- ============================================
-- Comments
-- ============================================

COMMENT ON COLUMN summer_documents.chunking_strategy IS 'Chunking strategy used: sliding_window, sentence, paragraph, semantic';
COMMENT ON COLUMN summer_documents.embedding_model IS 'Embedding model used: voyage-3, voyage-3-lite, voyage-code-3, voyage-finance-2';
COMMENT ON COLUMN summer_documents.chunk_count IS 'Denormalized count of chunks for this document';
COMMENT ON COLUMN summer_documents.total_tokens IS 'Total estimated tokens across all chunks';
COMMENT ON COLUMN summer_documents.status IS 'Document processing status';
COMMENT ON COLUMN summer_chunks.start_offset IS 'Start character offset in original document';
COMMENT ON COLUMN summer_chunks.end_offset IS 'End character offset in original document';

COMMENT ON FUNCTION get_document_with_chunks IS 'Get document details with all chunks as JSONB array';
COMMENT ON FUNCTION bulk_delete_documents IS 'Bulk delete documents and return counts';
COMMENT ON FUNCTION summer_search_chunks_with_docs IS 'Vector search with document metadata included';
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
-- Seizn Winter - Organization Governance Enhancement
-- Migration: 044_org_governance.sql
--
-- Extends the existing organization/audit infrastructure with:
-- - Team management
-- - Custom roles
-- - Organization policies
-- - Enhanced audit logging
-- - Report storage

-- ===========================================
-- 1) Teams (within Organizations)
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  description TEXT,

  -- Settings
  settings JSONB DEFAULT '{}'::JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, slug)
);

-- Team members
CREATE TABLE IF NOT EXISTS winter_org_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES winter_org_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Role within team: lead, member, viewer
  role VARCHAR(20) NOT NULL DEFAULT 'member',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_winter_org_teams_org ON winter_org_teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_winter_org_team_members_team ON winter_org_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_winter_org_team_members_user ON winter_org_team_members(user_id);

-- ===========================================
-- 2) Custom Roles
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Base role to inherit from: owner, admin, member, viewer
  base_role VARCHAR(20) NOT NULL DEFAULT 'member',

  -- Custom permission overrides
  permissions JSONB NOT NULL DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_winter_org_custom_roles_org ON winter_org_custom_roles(organization_id);

-- ===========================================
-- 3) Organization Policies
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Policy type: retention_policy, pii_policy, access_policy, audit_policy, security_policy
  policy_type VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Policy configuration (JSON schema depends on policy_type)
  config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Scope: who this policy applies to
  -- { "all": true } or { "team_ids": [...] } or { "user_ids": [...] }
  scope JSONB NOT NULL DEFAULT '{"all": true}'::JSONB,

  -- Priority for conflict resolution (higher = takes precedence)
  priority INT NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Metadata
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_winter_org_policies_org ON winter_org_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_winter_org_policies_type ON winter_org_policies(organization_id, policy_type);
CREATE INDEX IF NOT EXISTS idx_winter_org_policies_active ON winter_org_policies(organization_id, is_active) WHERE is_active = TRUE;

-- ===========================================
-- 4) Reports
-- ===========================================
CREATE TABLE IF NOT EXISTS winter_org_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Report type
  report_type VARCHAR(50) NOT NULL,

  -- Time period covered
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Report data (JSON)
  data JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Generation info
  generated_by VARCHAR(20) NOT NULL DEFAULT 'user', -- user, system
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Optional file storage
  file_url TEXT,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_winter_org_reports_org ON winter_org_reports(organization_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_winter_org_reports_type ON winter_org_reports(organization_id, report_type);

-- ===========================================
-- 5) Enhanced Organization Members
-- ===========================================

-- Add status column to organization_members if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organization_members' AND column_name = 'status'
  ) THEN
    ALTER TABLE organization_members ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;
END $$;

-- Add last_active_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organization_members' AND column_name = 'last_active_at'
  ) THEN
    ALTER TABLE organization_members ADD COLUMN last_active_at TIMESTAMPTZ;
  END IF;
END $$;

-- ===========================================
-- 6) RLS Policies
-- ===========================================

ALTER TABLE winter_org_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_org_reports ENABLE ROW LEVEL SECURITY;

-- Teams: Org members can view, admins can manage
CREATE POLICY "Org members can view teams"
  ON winter_org_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_teams.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Admins can manage teams"
  ON winter_org_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_teams.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Team members: Team members can view, leads/admins can manage
CREATE POLICY "Team members can view team members"
  ON winter_org_team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winter_org_team_members tm
      WHERE tm.team_id = winter_org_team_members.team_id
      AND tm.user_id = auth.uid()::text
    )
    OR
    EXISTS (
      SELECT 1 FROM winter_org_teams t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE t.id = winter_org_team_members.team_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Leads and admins can manage team members"
  ON winter_org_team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM winter_org_team_members tm
      WHERE tm.team_id = winter_org_team_members.team_id
      AND tm.user_id = auth.uid()::text
      AND tm.role = 'lead'
    )
    OR
    EXISTS (
      SELECT 1 FROM winter_org_teams t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE t.id = winter_org_team_members.team_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Custom roles: Org members can view, owner can manage
CREATE POLICY "Org members can view custom roles"
  ON winter_org_custom_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_custom_roles.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Owner can manage custom roles"
  ON winter_org_custom_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_custom_roles.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role = 'owner'
    )
  );

-- Policies: Org members can view, admins can manage
CREATE POLICY "Org members can view policies"
  ON winter_org_policies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_policies.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Admins can manage policies"
  ON winter_org_policies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_policies.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- Reports: Org members can view, admins can create
CREATE POLICY "Org members can view reports"
  ON winter_org_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_reports.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Admins can create reports"
  ON winter_org_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = winter_org_reports.organization_id
      AND om.user_id = auth.uid()::text
      AND om.role IN ('owner', 'admin')
    )
  );

-- ===========================================
-- 7) Helper Functions
-- ===========================================

-- Function to get effective policy for an org
CREATE OR REPLACE FUNCTION get_effective_org_policy(
  p_org_id UUID,
  p_policy_type VARCHAR(50),
  p_team_id UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_policy JSONB;
BEGIN
  SELECT config INTO v_policy
  FROM winter_org_policies
  WHERE organization_id = p_org_id
    AND policy_type = p_policy_type
    AND is_active = TRUE
    AND (
      (scope->>'all')::boolean = TRUE
      OR (p_team_id IS NOT NULL AND p_team_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(scope->'team_ids'))))
      OR (p_user_id IS NOT NULL AND p_user_id = ANY(ARRAY(SELECT jsonb_array_elements_text(scope->'user_ids'))))
    )
  ORDER BY priority DESC
  LIMIT 1;

  RETURN COALESCE(v_policy, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check user permission in org
CREATE OR REPLACE FUNCTION check_org_permission(
  p_org_id UUID,
  p_user_id TEXT,
  p_resource VARCHAR(50),
  p_action VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role VARCHAR(20);
  v_has_permission BOOLEAN := FALSE;
BEGIN
  -- Get user's role in org
  SELECT role INTO v_role
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = p_user_id
    AND (status IS NULL OR status = 'active');

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Owner has all permissions
  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  -- Admin has most permissions except billing admin
  IF v_role = 'admin' THEN
    IF p_resource = 'billing' AND p_action = 'admin' THEN
      RETURN FALSE;
    END IF;
    RETURN TRUE;
  END IF;

  -- Member can read most things and create/update own resources
  IF v_role = 'member' THEN
    IF p_action = 'read' THEN
      RETURN TRUE;
    END IF;
    IF p_resource IN ('memories', 'collections', 'documents') AND p_action IN ('create', 'update', 'delete') THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- Viewer can only read
  IF v_role = 'viewer' THEN
    RETURN p_action = 'read' AND p_resource NOT IN ('audit_logs', 'billing');
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log org audit event
CREATE OR REPLACE FUNCTION log_org_audit_event(
  p_user_id TEXT,
  p_organization_id UUID,
  p_action VARCHAR(50),
  p_resource_type VARCHAR(50),
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::JSONB,
  p_previous_state JSONB DEFAULT NULL,
  p_new_state JSONB DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT 'success'
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    user_id, organization_id, action, resource_type, resource_id,
    details, previous_state, new_state, status
  ) VALUES (
    p_user_id, p_organization_id, p_action, p_resource_type, p_resource_id,
    p_details, p_previous_state, p_new_state, p_status
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 8) Triggers for Auto-Updating
-- ===========================================

-- Auto-update updated_at on teams
CREATE OR REPLACE FUNCTION update_winter_org_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_winter_org_teams_updated ON winter_org_teams;
CREATE TRIGGER trigger_winter_org_teams_updated
  BEFORE UPDATE ON winter_org_teams
  FOR EACH ROW
  EXECUTE FUNCTION update_winter_org_teams_updated_at();

-- Auto-update updated_at on custom roles
CREATE OR REPLACE FUNCTION update_winter_org_custom_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_winter_org_custom_roles_updated ON winter_org_custom_roles;
CREATE TRIGGER trigger_winter_org_custom_roles_updated
  BEFORE UPDATE ON winter_org_custom_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_winter_org_custom_roles_updated_at();

-- Auto-update updated_at on policies
CREATE OR REPLACE FUNCTION update_winter_org_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_winter_org_policies_updated ON winter_org_policies;
CREATE TRIGGER trigger_winter_org_policies_updated
  BEFORE UPDATE ON winter_org_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_winter_org_policies_updated_at();

-- ===========================================
-- 9) Audit Triggers for New Tables
-- ===========================================

-- Team audit trigger
CREATE OR REPLACE FUNCTION audit_winter_org_teams_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_org_audit_event(
      NULL, NEW.organization_id,
      'team.create', 'teams', NEW.id,
      jsonb_build_object('name', NEW.name, 'slug', NEW.slug)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.name IS DISTINCT FROM NEW.name OR OLD.settings IS DISTINCT FROM NEW.settings THEN
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'team.update', 'teams', NEW.id,
        NULL,
        jsonb_build_object('name', OLD.name, 'settings', OLD.settings),
        jsonb_build_object('name', NEW.name, 'settings', NEW.settings)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_org_audit_event(
      NULL, OLD.organization_id,
      'team.delete', 'teams', OLD.id,
      jsonb_build_object('name', OLD.name)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_winter_org_teams_trigger ON winter_org_teams;
CREATE TRIGGER audit_winter_org_teams_trigger
  AFTER INSERT OR UPDATE OR DELETE ON winter_org_teams
  FOR EACH ROW
  EXECUTE FUNCTION audit_winter_org_teams_changes();

-- Policy audit trigger
CREATE OR REPLACE FUNCTION audit_winter_org_policies_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_org_audit_event(
      NEW.created_by, NEW.organization_id,
      'policy.create', 'policies', NEW.id,
      jsonb_build_object('policy_type', NEW.policy_type, 'name', NEW.name)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'policy.deactivate', 'policies', NEW.id,
        jsonb_build_object('policy_type', NEW.policy_type, 'name', NEW.name)
      );
    ELSIF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'policy.activate', 'policies', NEW.id,
        jsonb_build_object('policy_type', NEW.policy_type, 'name', NEW.name)
      );
    ELSE
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'policy.update', 'policies', NEW.id,
        NULL,
        jsonb_build_object('config', OLD.config),
        jsonb_build_object('config', NEW.config)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_org_audit_event(
      NULL, OLD.organization_id,
      'policy.delete', 'policies', OLD.id,
      jsonb_build_object('policy_type', OLD.policy_type, 'name', OLD.name)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_winter_org_policies_trigger ON winter_org_policies;
CREATE TRIGGER audit_winter_org_policies_trigger
  AFTER INSERT OR UPDATE OR DELETE ON winter_org_policies
  FOR EACH ROW
  EXECUTE FUNCTION audit_winter_org_policies_changes();

-- ===========================================
-- 10) Comments
-- ===========================================
COMMENT ON TABLE winter_org_teams IS 'Teams within organizations for resource grouping';
COMMENT ON TABLE winter_org_team_members IS 'Team membership with roles';
COMMENT ON TABLE winter_org_custom_roles IS 'Custom roles defined per organization';
COMMENT ON TABLE winter_org_policies IS 'Organization-level policies (retention, PII, access, etc.)';
COMMENT ON TABLE winter_org_reports IS 'Generated reports for organizations';
COMMENT ON FUNCTION get_effective_org_policy IS 'Get the effective policy config for an org/team/user';
COMMENT ON FUNCTION check_org_permission IS 'Check if a user has permission for a resource action';
COMMENT ON FUNCTION log_org_audit_event IS 'Log an audit event for organization actions';
