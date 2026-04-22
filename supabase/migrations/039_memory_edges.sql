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
      SELECT id FROM memories WHERE user_id = auth.uid()::text
    )
    OR target_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()::text
    )
  );

-- Users can insert edges between their own memories
CREATE POLICY "Users can insert edges between own memories"
  ON memory_edges FOR INSERT
  WITH CHECK (
    source_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()::text
    )
    AND target_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()::text
    )
  );

-- Users can update edges for their own memories
CREATE POLICY "Users can update edges for own memories"
  ON memory_edges FOR UPDATE
  USING (
    source_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()::text
    )
  );

-- Users can delete edges for their own memories
CREATE POLICY "Users can delete edges for own memories"
  ON memory_edges FOR DELETE
  USING (
    source_memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()::text
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
