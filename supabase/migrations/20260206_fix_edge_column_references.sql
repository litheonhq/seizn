-- Fix Edge Column References Migration
--
-- Problem: v3 functions use from_note_id/to_note_id but v4_supplement
-- recreated the table with src_memory_id/dst_memory_id
--
-- This migration updates all functions to use the correct column names.

-- =============================================================================
-- 1. Fix get_connected_memory_notes function
-- =============================================================================

CREATE OR REPLACE FUNCTION get_connected_memory_notes(
  p_note_id UUID,
  p_edge_types TEXT[] DEFAULT NULL,
  p_min_weight FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  note_id UUID,
  edge_type TEXT,
  weight FLOAT,
  direction TEXT,
  evidence JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Outgoing edges (using correct v4 column names)
  SELECT
    e.dst_memory_id AS note_id,
    e.edge_type::TEXT,
    e.weight::FLOAT,
    'outgoing'::TEXT AS direction,
    COALESCE(e.reason::JSONB, '{}'::JSONB) AS evidence
  FROM spring_memory_edges e
  WHERE e.src_memory_id = p_note_id
    AND e.weight >= p_min_weight
    AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))

  UNION ALL

  -- Incoming edges
  SELECT
    e.src_memory_id AS note_id,
    e.edge_type::TEXT,
    e.weight::FLOAT,
    'incoming'::TEXT AS direction,
    COALESCE(e.reason::JSONB, '{}'::JSONB) AS evidence
  FROM spring_memory_edges e
  WHERE e.dst_memory_id = p_note_id
    AND e.weight >= p_min_weight
    AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))

  ORDER BY weight DESC;
END;
$$;

-- =============================================================================
-- 2. Fix upsert_spring_memory_edge function
-- =============================================================================

DROP FUNCTION IF EXISTS upsert_spring_memory_edge(UUID, UUID, TEXT, FLOAT, JSONB);

CREATE OR REPLACE FUNCTION upsert_spring_memory_edge(
  p_src_memory_id UUID,
  p_dst_memory_id UUID,
  p_edge_type TEXT,
  p_weight FLOAT DEFAULT 1.0,
  p_reason TEXT DEFAULT NULL,
  p_confidence FLOAT DEFAULT 1.0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_edge_id UUID;
BEGIN
  INSERT INTO spring_memory_edges (
    src_memory_id,
    dst_memory_id,
    edge_type,
    weight,
    reason,
    confidence
  ) VALUES (
    p_src_memory_id,
    p_dst_memory_id,
    p_edge_type,
    p_weight,
    p_reason,
    p_confidence
  )
  ON CONFLICT (src_memory_id, dst_memory_id, edge_type)
  DO UPDATE SET
    weight = EXCLUDED.weight,
    reason = COALESCE(EXCLUDED.reason, spring_memory_edges.reason),
    confidence = EXCLUDED.confidence
  RETURNING id INTO v_edge_id;

  RETURN v_edge_id;
END;
$$;

-- =============================================================================
-- 3. Add aliases for backward compatibility (optional helper functions)
-- =============================================================================

-- Alias function that maps old parameter names to new ones
CREATE OR REPLACE FUNCTION upsert_memory_edge_compat(
  p_from_note_id UUID,
  p_to_note_id UUID,
  p_edge_type TEXT,
  p_weight FLOAT DEFAULT 1.0,
  p_evidence JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN upsert_spring_memory_edge(
    p_from_note_id,  -- maps to src_memory_id
    p_to_note_id,    -- maps to dst_memory_id
    p_edge_type,
    p_weight,
    p_evidence->>'reason',
    COALESCE((p_evidence->>'confidence')::FLOAT, 1.0)
  );
END;
$$;

-- =============================================================================
-- 4. Verify search_spring_memories_with_graph uses correct columns
-- (It should already use src_memory_id/dst_memory_id from HNSW migration)
-- =============================================================================

-- No changes needed if the HNSW migration already uses correct column names

-- =============================================================================
-- 5. Add comments
-- =============================================================================

COMMENT ON FUNCTION get_connected_memory_notes IS 'Get connected notes via edges (1 hop) - uses v4 column names (src_memory_id, dst_memory_id)';
COMMENT ON FUNCTION upsert_spring_memory_edge IS 'Upsert memory edge with v4 column names';
COMMENT ON FUNCTION upsert_memory_edge_compat IS 'Backward compatible wrapper using v3 parameter names';
