-- ===========================================
-- Spring Memory Search v4 Fix
-- Migration: 20260205_spring_memory_search_v4_fix.sql
--
-- Fixes:
-- 1. Corrects v3 column name references (note_type, not type)
-- 2. Integrates HNSW optimization (ef_search, iterative scan)
-- 3. Adds 2-stage query pattern for filtered searches
-- 4. Adds tags column if missing (payload_json fallback)
-- ===========================================

-- ===========================================
-- 1. Add missing columns for v4 search compatibility
-- ===========================================

-- Add tags column for backward compatibility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spring_memory_notes' AND column_name = 'tags'
  ) THEN
    ALTER TABLE spring_memory_notes ADD COLUMN tags TEXT[] DEFAULT '{}';
    COMMENT ON COLUMN spring_memory_notes.tags IS 'Tags for filtering (also stored in payload_json for v3 compat)';
  END IF;
END $$;

-- Add content_tsv for full-text search
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spring_memory_notes' AND column_name = 'content_tsv'
  ) THEN
    ALTER TABLE spring_memory_notes ADD COLUMN content_tsv tsvector;
    COMMENT ON COLUMN spring_memory_notes.content_tsv IS 'Full-text search vector for hybrid search';
  END IF;
END $$;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_spring_notes_content_tsv
  ON spring_memory_notes USING GIN (content_tsv)
  WHERE content_tsv IS NOT NULL;

-- GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_spring_notes_tags_gin
  ON spring_memory_notes USING GIN (tags)
  WHERE array_length(tags, 1) > 0;

-- ===========================================
-- 2. Trigger to update content_tsv
-- ===========================================

CREATE OR REPLACE FUNCTION update_spring_notes_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spring_notes_tsv ON spring_memory_notes;
CREATE TRIGGER trg_spring_notes_tsv
  BEFORE INSERT OR UPDATE OF content ON spring_memory_notes
  FOR EACH ROW EXECUTE FUNCTION update_spring_notes_tsv();

-- ===========================================
-- 3. Fixed search_spring_memory_notes_v3 with HNSW optimization
-- ===========================================

-- Drop old function to replace
DROP FUNCTION IF EXISTS search_spring_memory_notes_v3(
  TEXT, vector(1536), TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[],
  TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, INT
);

CREATE OR REPLACE FUNCTION search_spring_memory_notes_v3(
  p_user_id TEXT,
  p_query_embedding vector(1536),
  p_query_text TEXT DEFAULT NULL,
  p_types TEXT[] DEFAULT NULL,          -- note_type filter
  p_categories TEXT[] DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_privacy_classes TEXT[] DEFAULT NULL,
  p_statuses TEXT[] DEFAULT NULL,
  p_agent_id TEXT DEFAULT NULL,
  p_namespace TEXT DEFAULT NULL,        -- maps to scope column
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_include_expired BOOLEAN DEFAULT false,
  p_limit INT DEFAULT 20,
  p_ef_search INT DEFAULT 100           -- HNSW tuning parameter
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type TEXT,                       -- Fixed: was 'type'
  status TEXT,
  category TEXT,
  tags TEXT[],
  privacy_class TEXT,
  metadata JSONB,
  extraction_confidence NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) AS $$
DECLARE
  v_ts_query tsquery;
  v_has_filters BOOLEAN;
  v_oversample INT;
BEGIN
  -- Set HNSW search parameter
  PERFORM set_config('hnsw.ef_search', p_ef_search::TEXT, true);

  -- Check if we have filters (for iterative scan)
  v_has_filters := (
    p_types IS NOT NULL OR
    p_categories IS NOT NULL OR
    p_tags IS NOT NULL OR
    p_privacy_classes IS NOT NULL OR
    p_statuses IS NOT NULL OR
    p_namespace IS NOT NULL
  );

  -- Calculate oversample factor
  v_oversample := CASE WHEN v_has_filters THEN p_limit * 3 ELSE p_limit * 2 END;

  -- Enable iterative scan for filtered queries
  IF v_has_filters THEN
    BEGIN
      PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- Not supported, continue
    END;
  END IF;

  -- Build text search query if provided
  IF p_query_text IS NOT NULL AND p_query_text != '' THEN
    v_ts_query := websearch_to_tsquery('english', p_query_text);
  END IF;

  RETURN QUERY
  WITH semantic_results AS (
    -- Stage 1: Oversample with HNSW
    SELECT
      n.id,
      1 - (n.embedding <=> p_query_embedding) AS score
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status != 'deleted'
      AND n.embedding IS NOT NULL
      -- Fixed: use note_type instead of type
      AND (p_types IS NULL OR n.note_type = ANY(p_types))
      AND (p_categories IS NULL OR n.category = ANY(p_categories))
      -- Fixed: use tags column with payload_json fallback
      AND (p_tags IS NULL OR n.tags && p_tags OR
           EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(n.payload_json->'tags') t
             WHERE t = ANY(p_tags)
           ))
      AND (p_privacy_classes IS NULL OR n.privacy_class = ANY(p_privacy_classes))
      AND (p_statuses IS NULL OR n.status = ANY(p_statuses))
      -- Fixed: namespace maps to scope column
      AND (p_namespace IS NULL OR n.scope = p_namespace)
      AND (p_since IS NULL OR n.created_at >= p_since)
      AND (p_until IS NULL OR n.created_at <= p_until)
      AND (p_include_expired OR n.valid_until IS NULL OR n.valid_until > now())
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT v_oversample
  ),
  keyword_results AS (
    SELECT
      n.id,
      CASE
        WHEN v_ts_query IS NOT NULL AND n.content_tsv IS NOT NULL
        THEN ts_rank_cd(n.content_tsv, v_ts_query)
        WHEN v_ts_query IS NOT NULL
        THEN ts_rank_cd(to_tsvector('english', n.content), v_ts_query)
        ELSE 0
      END AS score
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status != 'deleted'
      AND (v_ts_query IS NULL OR
           (n.content_tsv IS NOT NULL AND n.content_tsv @@ v_ts_query) OR
           (n.content_tsv IS NULL AND to_tsvector('english', n.content) @@ v_ts_query))
      AND (p_types IS NULL OR n.note_type = ANY(p_types))
      AND (p_categories IS NULL OR n.category = ANY(p_categories))
      AND (p_tags IS NULL OR n.tags && p_tags OR
           EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(n.payload_json->'tags') t
             WHERE t = ANY(p_tags)
           ))
      AND (p_privacy_classes IS NULL OR n.privacy_class = ANY(p_privacy_classes))
      AND (p_statuses IS NULL OR n.status = ANY(p_statuses))
      AND (p_namespace IS NULL OR n.scope = p_namespace)
      AND (p_since IS NULL OR n.created_at >= p_since)
      AND (p_until IS NULL OR n.created_at <= p_until)
      AND (p_include_expired OR n.valid_until IS NULL OR n.valid_until > now())
    LIMIT v_oversample
  ),
  combined AS (
    SELECT
      COALESCE(s.id, k.id) AS id,
      COALESCE(s.score, 0) AS semantic_score,
      COALESCE(k.score, 0) AS keyword_score,
      -- RRF combination with proper ranking
      (1.0 / (60 + ROW_NUMBER() OVER (ORDER BY s.score DESC NULLS LAST))) +
      (1.0 / (60 + ROW_NUMBER() OVER (ORDER BY k.score DESC NULLS LAST))) AS combined_score
    FROM semantic_results s
    FULL OUTER JOIN keyword_results k ON s.id = k.id
  )
  SELECT
    n.id,
    n.content,
    n.note_type,          -- Fixed: return note_type not type
    n.status,
    n.category,
    COALESCE(n.tags, ARRAY(SELECT jsonb_array_elements_text(n.payload_json->'tags'))) AS tags,
    n.privacy_class,
    n.payload_json AS metadata,  -- Fixed: payload_json not metadata
    n.extraction_confidence,
    n.created_at,
    n.updated_at,
    n.valid_until,
    c.semantic_score::FLOAT,
    c.keyword_score::FLOAT,
    c.combined_score::FLOAT
  FROM combined c
  JOIN spring_memory_notes n ON n.id = c.id
  ORDER BY c.combined_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ===========================================
-- 4. Unified search function (combines all patterns)
-- ===========================================

CREATE OR REPLACE FUNCTION search_spring_memories_unified(
  p_user_id TEXT,
  p_query_embedding vector(1536),
  p_options JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type TEXT,
  scope TEXT,
  tags TEXT[],
  confidence FLOAT,
  importance INTEGER,
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Extract options
  v_query_text TEXT := p_options->>'query_text';
  v_scope TEXT := p_options->>'scope';
  v_note_type TEXT := p_options->>'note_type';
  v_types TEXT[] := ARRAY(SELECT jsonb_array_elements_text(p_options->'types'));
  v_tags TEXT[] := ARRAY(SELECT jsonb_array_elements_text(p_options->'tags'));
  v_limit INT := COALESCE((p_options->>'limit')::INT, 10);
  v_threshold FLOAT := COALESCE((p_options->>'threshold')::FLOAT, 0.5);
  v_ef_search INT := COALESCE((p_options->>'ef_search')::INT, 100);
  v_mode TEXT := COALESCE(p_options->>'mode', 'hybrid');  -- 'semantic', 'keyword', 'hybrid'

  -- Computed values
  v_has_filters BOOLEAN;
  v_oversample INT;
  v_ts_query tsquery;
BEGIN
  -- Set HNSW parameter
  PERFORM set_config('hnsw.ef_search', v_ef_search::TEXT, true);

  -- Check filters
  v_has_filters := (
    v_scope IS NOT NULL OR
    v_note_type IS NOT NULL OR
    array_length(v_types, 1) > 0 OR
    array_length(v_tags, 1) > 0
  );

  v_oversample := CASE WHEN v_has_filters THEN v_limit * 3 ELSE v_limit * 2 END;

  -- Enable iterative scan
  IF v_has_filters THEN
    BEGIN
      PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Build text search query
  IF v_query_text IS NOT NULL AND v_query_text != '' THEN
    v_ts_query := websearch_to_tsquery('english', v_query_text);
  END IF;

  RETURN QUERY
  WITH
  -- Semantic search
  semantic AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.scope,
      COALESCE(n.tags, '{}') AS tags,
      n.confidence,
      n.importance,
      n.created_at,
      1 - (n.embedding <=> p_query_embedding) AS vec_score,
      ROW_NUMBER() OVER (ORDER BY n.embedding <=> p_query_embedding) AS vec_rank
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> p_query_embedding) > v_threshold
      AND (v_scope IS NULL OR n.scope = v_scope)
      AND (v_note_type IS NULL OR n.note_type = v_note_type)
      AND (array_length(v_types, 1) IS NULL OR n.note_type = ANY(v_types))
      AND (array_length(v_tags, 1) IS NULL OR n.tags && v_tags)
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT v_oversample
  ),
  -- Keyword search (if text provided)
  keyword AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.scope,
      COALESCE(n.tags, '{}') AS tags,
      n.confidence,
      n.importance,
      n.created_at,
      CASE
        WHEN v_ts_query IS NOT NULL AND n.content_tsv IS NOT NULL
        THEN ts_rank_cd(n.content_tsv, v_ts_query)
        WHEN v_ts_query IS NOT NULL
        THEN ts_rank_cd(to_tsvector('english', n.content), v_ts_query)
        ELSE 0
      END AS kw_score,
      ROW_NUMBER() OVER (ORDER BY
        CASE
          WHEN n.content_tsv IS NOT NULL THEN ts_rank_cd(n.content_tsv, v_ts_query)
          ELSE ts_rank_cd(to_tsvector('english', n.content), v_ts_query)
        END DESC
      ) AS kw_rank
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND v_ts_query IS NOT NULL
      AND ((n.content_tsv IS NOT NULL AND n.content_tsv @@ v_ts_query)
           OR to_tsvector('english', n.content) @@ v_ts_query)
      AND (v_scope IS NULL OR n.scope = v_scope)
      AND (v_note_type IS NULL OR n.note_type = v_note_type)
      AND (array_length(v_types, 1) IS NULL OR n.note_type = ANY(v_types))
      AND (array_length(v_tags, 1) IS NULL OR n.tags && v_tags)
    LIMIT v_oversample
  ),
  -- Combine using RRF
  combined AS (
    SELECT
      COALESCE(s.id, k.id) AS id,
      COALESCE(s.content, k.content) AS content,
      COALESCE(s.note_type, k.note_type) AS note_type,
      COALESCE(s.scope, k.scope) AS scope,
      COALESCE(s.tags, k.tags) AS tags,
      COALESCE(s.confidence, k.confidence) AS confidence,
      COALESCE(s.importance, k.importance) AS importance,
      COALESCE(s.created_at, k.created_at) AS created_at,
      COALESCE(s.vec_score, 0)::FLOAT AS semantic_score,
      COALESCE(k.kw_score, 0)::FLOAT AS keyword_score,
      CASE v_mode
        WHEN 'semantic' THEN COALESCE(s.vec_score, 0)
        WHEN 'keyword' THEN COALESCE(k.kw_score, 0)
        ELSE -- hybrid (RRF)
          (0.7 / (60 + COALESCE(s.vec_rank, v_oversample))) +
          (0.3 / (60 + COALESCE(k.kw_rank, v_oversample)))
      END AS combined_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    c.id,
    c.content,
    c.note_type,
    c.scope,
    c.tags,
    c.confidence,
    c.importance,
    c.semantic_score,
    c.keyword_score,
    c.combined_score::FLOAT,
    c.created_at
  FROM combined c
  ORDER BY c.combined_score DESC
  LIMIT v_limit;
END;
$$;

-- ===========================================
-- 5. Search with graph expansion
-- ===========================================

CREATE OR REPLACE FUNCTION search_spring_memories_with_graph(
  p_user_id TEXT,
  p_query_embedding vector(1536),
  p_limit INT DEFAULT 10,
  p_expand_hops INT DEFAULT 1,        -- How many hops to follow edges
  p_edge_types TEXT[] DEFAULT ARRAY['relates_to', 'supports', 'derived_from'],
  p_ef_search INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type TEXT,
  similarity FLOAT,
  is_expanded BOOLEAN,
  expansion_path TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set HNSW parameter
  PERFORM set_config('hnsw.ef_search', p_ef_search::TEXT, true);

  RETURN QUERY
  WITH RECURSIVE
  -- Direct semantic matches
  direct_matches AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      1 - (n.embedding <=> p_query_embedding) AS similarity,
      FALSE AS is_expanded,
      ARRAY[n.id::TEXT] AS expansion_path,
      0 AS hop
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.embedding IS NOT NULL
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT p_limit
  ),
  -- Graph expansion
  expanded AS (
    SELECT * FROM direct_matches

    UNION

    SELECT
      n.id,
      n.content,
      n.note_type,
      prev.similarity * e.weight AS similarity,  -- Decay by edge weight
      TRUE AS is_expanded,
      prev.expansion_path || n.id::TEXT,
      prev.hop + 1
    FROM expanded prev
    JOIN spring_memory_edges e ON (
      e.src_memory_id = prev.id OR e.dst_memory_id = prev.id
    )
    JOIN spring_memory_notes n ON (
      n.id = CASE
        WHEN e.src_memory_id = prev.id THEN e.dst_memory_id
        ELSE e.src_memory_id
      END
    )
    WHERE prev.hop < p_expand_hops
      AND e.edge_type = ANY(p_edge_types)
      AND n.user_id = p_user_id
      AND n.status = 'active'
      AND NOT n.id = ANY(ARRAY(SELECT DISTINCT unnest(prev.expansion_path)::UUID))
  )
  SELECT DISTINCT ON (e.id)
    e.id,
    e.content,
    e.note_type,
    e.similarity::FLOAT,
    e.is_expanded,
    e.expansion_path
  FROM expanded e
  ORDER BY e.id, e.similarity DESC
  LIMIT p_limit * 2;  -- Allow more results due to expansion
END;
$$;

-- ===========================================
-- 6. Backfill content_tsv for existing data
-- ===========================================

-- Run this as a background job for large tables
CREATE OR REPLACE FUNCTION backfill_spring_notes_tsv(p_batch_size INT DEFAULT 1000)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  WITH to_update AS (
    SELECT id
    FROM spring_memory_notes
    WHERE content_tsv IS NULL AND content IS NOT NULL
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE spring_memory_notes n
  SET content_tsv = to_tsvector('english', n.content)
  FROM to_update t
  WHERE n.id = t.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- 7. Comments
-- ===========================================

COMMENT ON FUNCTION search_spring_memory_notes_v3 IS
  'Fixed v3 search with correct column names (note_type, payload_json) and HNSW optimization';

COMMENT ON FUNCTION search_spring_memories_unified IS
  'Unified search with flexible options, HNSW tuning, and mode selection (semantic/keyword/hybrid)';

COMMENT ON FUNCTION search_spring_memories_with_graph IS
  'Graph-expanded search that follows edges to find related memories';

COMMENT ON FUNCTION backfill_spring_notes_tsv IS
  'Backfill content_tsv for full-text search. Run in batches for large tables.';
