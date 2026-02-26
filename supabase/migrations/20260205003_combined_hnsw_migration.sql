-- ===========================================
-- Spring Memory HNSW + Search v4 Combined Migration
-- Run this in Supabase SQL Editor
-- ===========================================

-- 1. Check pgvector version
CREATE OR REPLACE FUNCTION check_pgvector_version()
RETURNS TABLE (version TEXT, supports_iterative_scan BOOLEAN, supports_hnsw BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_version TEXT; v_major INT; v_minor INT;
BEGIN
  SELECT extversion INTO v_version FROM pg_extension WHERE extname = 'vector';
  IF v_version IS NULL THEN RETURN QUERY SELECT 'not installed'::TEXT, FALSE, FALSE; RETURN; END IF;
  v_major := split_part(v_version, '.', 1)::INT;
  v_minor := split_part(v_version, '.', 2)::INT;
  RETURN QUERY SELECT v_version, (v_major > 0 OR (v_major = 0 AND v_minor >= 8)), (v_major > 0 OR (v_major = 0 AND v_minor >= 5));
END; $$;

-- 2. Replace IVFFlat with HNSW indexes
DROP INDEX IF EXISTS idx_spring_notes_embedding;
CREATE INDEX idx_spring_notes_embedding_hnsw ON spring_memory_notes
  USING hnsw (embedding vector_cosine_ops) WITH (m = 24, ef_construction = 100)
  WHERE status = 'active' AND embedding IS NOT NULL;

DROP INDEX IF EXISTS idx_spring_entities_embedding;
CREATE INDEX idx_spring_entities_embedding_hnsw ON spring_entities
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- 3. Composite indexes
CREATE INDEX IF NOT EXISTS idx_spring_notes_user_scope_status ON spring_memory_notes(user_id, scope, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_spring_notes_user_type_status ON spring_memory_notes(user_id, note_type, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_spring_notes_workspace_status ON spring_memory_notes(workspace_id, status) WHERE workspace_id IS NOT NULL AND status = 'active';

-- 4. Add missing columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spring_memory_notes' AND column_name = 'tags') THEN
    ALTER TABLE spring_memory_notes ADD COLUMN tags TEXT[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spring_memory_notes' AND column_name = 'content_tsv') THEN
    ALTER TABLE spring_memory_notes ADD COLUMN content_tsv tsvector;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_spring_notes_content_tsv ON spring_memory_notes USING GIN (content_tsv) WHERE content_tsv IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spring_notes_tags_gin ON spring_memory_notes USING GIN (tags) WHERE array_length(tags, 1) > 0;

-- 5. Trigger for content_tsv
CREATE OR REPLACE FUNCTION update_spring_notes_tsv() RETURNS TRIGGER AS $$
BEGIN NEW.content_tsv := to_tsvector('english', COALESCE(NEW.content, '')); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spring_notes_tsv ON spring_memory_notes;
CREATE TRIGGER trg_spring_notes_tsv BEFORE INSERT OR UPDATE OF content ON spring_memory_notes
  FOR EACH ROW EXECUTE FUNCTION update_spring_notes_tsv();

-- 6. search_spring_memory_notes_v4
DROP FUNCTION IF EXISTS search_spring_memory_notes(VECTOR(1536), TEXT, TEXT, TEXT, INTEGER, FLOAT);

CREATE OR REPLACE FUNCTION search_spring_memory_notes_v4(
  p_query_embedding VECTOR(1536), p_user_id TEXT, p_scope TEXT DEFAULT NULL,
  p_note_type TEXT DEFAULT NULL, p_match_count INTEGER DEFAULT 10,
  p_match_threshold FLOAT DEFAULT 0.7, p_ef_search INTEGER DEFAULT 100,
  p_oversample_factor INTEGER DEFAULT 3, p_use_iterative_scan BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (id UUID, content TEXT, note_type TEXT, scope TEXT, payload_json JSONB,
               confidence FLOAT, importance INTEGER, similarity FLOAT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_has_filters BOOLEAN; v_oversample_limit INTEGER;
BEGIN
  PERFORM set_config('hnsw.ef_search', p_ef_search::TEXT, true);
  v_has_filters := (p_scope IS NOT NULL OR p_note_type IS NOT NULL);
  v_oversample_limit := CASE WHEN v_has_filters THEN p_match_count * p_oversample_factor ELSE p_match_count END;
  IF p_use_iterative_scan AND v_has_filters THEN
    BEGIN PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN QUERY
  WITH oversample AS (
    SELECT n.id, n.content, n.note_type, n.scope, n.payload_json, n.confidence, n.importance,
           1 - (n.embedding <=> p_query_embedding) AS similarity, n.created_at
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id AND n.status = 'active' AND n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> p_query_embedding) > p_match_threshold
    ORDER BY n.embedding <=> p_query_embedding LIMIT v_oversample_limit
  )
  SELECT o.id, o.content, o.note_type, o.scope, o.payload_json, o.confidence, o.importance, o.similarity, o.created_at
  FROM oversample o
  WHERE (p_scope IS NULL OR o.scope = p_scope) AND (p_note_type IS NULL OR o.note_type = p_note_type)
  ORDER BY o.similarity DESC LIMIT p_match_count;
END; $$;

-- 7. Backward compatibility
CREATE OR REPLACE FUNCTION search_spring_memory_notes(
  p_query_embedding VECTOR(1536), p_user_id TEXT, p_scope TEXT DEFAULT NULL,
  p_note_type TEXT DEFAULT NULL, p_match_count INTEGER DEFAULT 10, p_match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (id UUID, content TEXT, note_type TEXT, scope TEXT, payload_json JSONB,
               confidence FLOAT, importance INTEGER, similarity FLOAT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT r.id, r.content, r.note_type, r.scope, r.payload_json, r.confidence, r.importance, r.similarity
  FROM search_spring_memory_notes_v4(p_query_embedding, p_user_id, p_scope, p_note_type, p_match_count, p_match_threshold, 100, 3, TRUE) r;
END; $$;

-- 8. ef_search recommendation
CREATE OR REPLACE FUNCTION recommend_spring_ef_search(
  p_user_id TEXT, p_top_k INT DEFAULT 10, p_recall_mode TEXT DEFAULT 'balanced', p_has_filters BOOLEAN DEFAULT FALSE
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_note_count BIGINT; v_base_ef INT;
BEGIN
  SELECT COUNT(*) INTO v_note_count FROM spring_memory_notes WHERE user_id = p_user_id AND status = 'active' AND embedding IS NOT NULL;
  v_base_ef := GREATEST(40, p_top_k * 4);
  IF v_note_count > 100000 THEN v_base_ef := v_base_ef * 1.5;
  ELSIF v_note_count > 10000 THEN v_base_ef := v_base_ef * 1.25; END IF;
  IF p_has_filters THEN v_base_ef := v_base_ef * 1.5; END IF;
  CASE p_recall_mode WHEN 'fast' THEN v_base_ef := GREATEST(32, v_base_ef * 0.6)::INT;
    WHEN 'high_recall' THEN v_base_ef := LEAST(400, v_base_ef * 2)::INT; ELSE v_base_ef := v_base_ef; END CASE;
  RETURN GREATEST(16, LEAST(400, v_base_ef));
END; $$;

-- 9. search_spring_memory_notes_v3 (fixed column names)
DROP FUNCTION IF EXISTS search_spring_memory_notes_v3(TEXT, vector(1536), TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, INT);

CREATE OR REPLACE FUNCTION search_spring_memory_notes_v3(
  p_user_id TEXT, p_query_embedding vector(1536), p_query_text TEXT DEFAULT NULL,
  p_types TEXT[] DEFAULT NULL, p_categories TEXT[] DEFAULT NULL, p_tags TEXT[] DEFAULT NULL,
  p_privacy_classes TEXT[] DEFAULT NULL, p_statuses TEXT[] DEFAULT NULL,
  p_agent_id TEXT DEFAULT NULL, p_namespace TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL, p_until TIMESTAMPTZ DEFAULT NULL,
  p_include_expired BOOLEAN DEFAULT false, p_limit INT DEFAULT 20, p_ef_search INT DEFAULT 100
)
RETURNS TABLE (id UUID, content TEXT, note_type TEXT, status TEXT, category TEXT, tags TEXT[],
               privacy_class TEXT, metadata JSONB, extraction_confidence NUMERIC,
               created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, valid_until TIMESTAMPTZ,
               semantic_score FLOAT, keyword_score FLOAT, combined_score FLOAT) AS $$
DECLARE v_ts_query tsquery; v_has_filters BOOLEAN; v_oversample INT;
BEGIN
  PERFORM set_config('hnsw.ef_search', p_ef_search::TEXT, true);
  v_has_filters := (p_types IS NOT NULL OR p_categories IS NOT NULL OR p_tags IS NOT NULL OR
                    p_privacy_classes IS NOT NULL OR p_statuses IS NOT NULL OR p_namespace IS NOT NULL);
  v_oversample := CASE WHEN v_has_filters THEN p_limit * 3 ELSE p_limit * 2 END;
  IF v_has_filters THEN BEGIN PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true); EXCEPTION WHEN OTHERS THEN NULL; END; END IF;
  IF p_query_text IS NOT NULL AND p_query_text != '' THEN v_ts_query := websearch_to_tsquery('english', p_query_text); END IF;
  RETURN QUERY
  WITH semantic_results AS (
    SELECT n.id, 1 - (n.embedding <=> p_query_embedding) AS score
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id AND n.status != 'deleted' AND n.embedding IS NOT NULL
      AND (p_types IS NULL OR n.note_type = ANY(p_types))
      AND (p_categories IS NULL OR n.category = ANY(p_categories))
      AND (p_tags IS NULL OR n.tags && p_tags OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(n.payload_json->'tags') t WHERE t = ANY(p_tags)))
      AND (p_privacy_classes IS NULL OR n.privacy_class = ANY(p_privacy_classes))
      AND (p_statuses IS NULL OR n.status = ANY(p_statuses))
      AND (p_namespace IS NULL OR n.scope = p_namespace)
      AND (p_since IS NULL OR n.created_at >= p_since) AND (p_until IS NULL OR n.created_at <= p_until)
      AND (p_include_expired OR n.valid_until IS NULL OR n.valid_until > now())
    ORDER BY n.embedding <=> p_query_embedding LIMIT v_oversample
  ),
  keyword_results AS (
    SELECT n.id, CASE WHEN v_ts_query IS NOT NULL AND n.content_tsv IS NOT NULL THEN ts_rank_cd(n.content_tsv, v_ts_query)
                      WHEN v_ts_query IS NOT NULL THEN ts_rank_cd(to_tsvector('english', n.content), v_ts_query) ELSE 0 END AS score
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id AND n.status != 'deleted'
      AND (v_ts_query IS NULL OR (n.content_tsv IS NOT NULL AND n.content_tsv @@ v_ts_query) OR (n.content_tsv IS NULL AND to_tsvector('english', n.content) @@ v_ts_query))
      AND (p_types IS NULL OR n.note_type = ANY(p_types)) AND (p_categories IS NULL OR n.category = ANY(p_categories))
      AND (p_tags IS NULL OR n.tags && p_tags OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(n.payload_json->'tags') t WHERE t = ANY(p_tags)))
      AND (p_privacy_classes IS NULL OR n.privacy_class = ANY(p_privacy_classes)) AND (p_statuses IS NULL OR n.status = ANY(p_statuses))
      AND (p_namespace IS NULL OR n.scope = p_namespace)
      AND (p_since IS NULL OR n.created_at >= p_since) AND (p_until IS NULL OR n.created_at <= p_until)
      AND (p_include_expired OR n.valid_until IS NULL OR n.valid_until > now()) LIMIT v_oversample
  ),
  combined AS (
    SELECT COALESCE(s.id, k.id) AS id, COALESCE(s.score, 0) AS semantic_score, COALESCE(k.score, 0) AS keyword_score,
           (1.0 / (60 + ROW_NUMBER() OVER (ORDER BY s.score DESC NULLS LAST))) +
           (1.0 / (60 + ROW_NUMBER() OVER (ORDER BY k.score DESC NULLS LAST))) AS combined_score
    FROM semantic_results s FULL OUTER JOIN keyword_results k ON s.id = k.id
  )
  SELECT n.id, n.content, n.note_type, n.status, n.category,
         COALESCE(n.tags, ARRAY(SELECT jsonb_array_elements_text(n.payload_json->'tags'))) AS tags,
         n.privacy_class, n.payload_json AS metadata, n.extraction_confidence,
         n.created_at, n.updated_at, n.valid_until,
         c.semantic_score::FLOAT, c.keyword_score::FLOAT, c.combined_score::FLOAT
  FROM combined c JOIN spring_memory_notes n ON n.id = c.id ORDER BY c.combined_score DESC LIMIT p_limit;
END; $$ LANGUAGE plpgsql STABLE;

-- 10. Unified search
CREATE OR REPLACE FUNCTION search_spring_memories_unified(
  p_user_id TEXT, p_query_embedding vector(1536), p_options JSONB DEFAULT '{}'
)
RETURNS TABLE (id UUID, content TEXT, note_type TEXT, scope TEXT, tags TEXT[], confidence FLOAT,
               importance INTEGER, semantic_score FLOAT, keyword_score FLOAT, combined_score FLOAT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_query_text TEXT := p_options->>'query_text'; v_scope TEXT := p_options->>'scope';
  v_note_type TEXT := p_options->>'note_type';
  v_types TEXT[] := ARRAY(SELECT jsonb_array_elements_text(p_options->'types'));
  v_tags TEXT[] := ARRAY(SELECT jsonb_array_elements_text(p_options->'tags'));
  v_limit INT := COALESCE((p_options->>'limit')::INT, 10);
  v_threshold FLOAT := COALESCE((p_options->>'threshold')::FLOAT, 0.5);
  v_ef_search INT := COALESCE((p_options->>'ef_search')::INT, 100);
  v_mode TEXT := COALESCE(p_options->>'mode', 'hybrid');
  v_has_filters BOOLEAN; v_oversample INT; v_ts_query tsquery;
BEGIN
  PERFORM set_config('hnsw.ef_search', v_ef_search::TEXT, true);
  v_has_filters := (v_scope IS NOT NULL OR v_note_type IS NOT NULL OR array_length(v_types, 1) > 0 OR array_length(v_tags, 1) > 0);
  v_oversample := CASE WHEN v_has_filters THEN v_limit * 3 ELSE v_limit * 2 END;
  IF v_has_filters THEN BEGIN PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true); EXCEPTION WHEN OTHERS THEN NULL; END; END IF;
  IF v_query_text IS NOT NULL AND v_query_text != '' THEN v_ts_query := websearch_to_tsquery('english', v_query_text); END IF;
  RETURN QUERY
  WITH semantic AS (
    SELECT n.id, n.content, n.note_type, n.scope, COALESCE(n.tags, '{}') AS tags, n.confidence, n.importance, n.created_at,
           1 - (n.embedding <=> p_query_embedding) AS vec_score,
           ROW_NUMBER() OVER (ORDER BY n.embedding <=> p_query_embedding) AS vec_rank
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id AND n.status = 'active' AND n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> p_query_embedding) > v_threshold
      AND (v_scope IS NULL OR n.scope = v_scope) AND (v_note_type IS NULL OR n.note_type = v_note_type)
      AND (array_length(v_types, 1) IS NULL OR n.note_type = ANY(v_types))
      AND (array_length(v_tags, 1) IS NULL OR n.tags && v_tags)
    ORDER BY n.embedding <=> p_query_embedding LIMIT v_oversample
  ),
  keyword AS (
    SELECT n.id, n.content, n.note_type, n.scope, COALESCE(n.tags, '{}') AS tags, n.confidence, n.importance, n.created_at,
           CASE WHEN v_ts_query IS NOT NULL AND n.content_tsv IS NOT NULL THEN ts_rank_cd(n.content_tsv, v_ts_query)
                WHEN v_ts_query IS NOT NULL THEN ts_rank_cd(to_tsvector('english', n.content), v_ts_query) ELSE 0 END AS kw_score,
           ROW_NUMBER() OVER (ORDER BY CASE WHEN n.content_tsv IS NOT NULL THEN ts_rank_cd(n.content_tsv, v_ts_query)
                ELSE ts_rank_cd(to_tsvector('english', n.content), v_ts_query) END DESC) AS kw_rank
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id AND n.status = 'active' AND v_ts_query IS NOT NULL
      AND ((n.content_tsv IS NOT NULL AND n.content_tsv @@ v_ts_query) OR to_tsvector('english', n.content) @@ v_ts_query)
      AND (v_scope IS NULL OR n.scope = v_scope) AND (v_note_type IS NULL OR n.note_type = v_note_type)
      AND (array_length(v_types, 1) IS NULL OR n.note_type = ANY(v_types))
      AND (array_length(v_tags, 1) IS NULL OR n.tags && v_tags) LIMIT v_oversample
  ),
  combined AS (
    SELECT COALESCE(s.id, k.id) AS id, COALESCE(s.content, k.content) AS content,
           COALESCE(s.note_type, k.note_type) AS note_type, COALESCE(s.scope, k.scope) AS scope,
           COALESCE(s.tags, k.tags) AS tags, COALESCE(s.confidence, k.confidence) AS confidence,
           COALESCE(s.importance, k.importance) AS importance, COALESCE(s.created_at, k.created_at) AS created_at,
           COALESCE(s.vec_score, 0)::FLOAT AS semantic_score, COALESCE(k.kw_score, 0)::FLOAT AS keyword_score,
           CASE v_mode WHEN 'semantic' THEN COALESCE(s.vec_score, 0) WHEN 'keyword' THEN COALESCE(k.kw_score, 0)
             ELSE (0.7 / (60 + COALESCE(s.vec_rank, v_oversample))) + (0.3 / (60 + COALESCE(k.kw_rank, v_oversample))) END AS combined_score
    FROM semantic s FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT c.id, c.content, c.note_type, c.scope, c.tags, c.confidence, c.importance,
         c.semantic_score, c.keyword_score, c.combined_score::FLOAT, c.created_at
  FROM combined c ORDER BY c.combined_score DESC LIMIT v_limit;
END; $$;

-- 11. Graph search
CREATE OR REPLACE FUNCTION search_spring_memories_with_graph(
  p_user_id TEXT, p_query_embedding vector(1536), p_limit INT DEFAULT 10,
  p_expand_hops INT DEFAULT 1, p_edge_types TEXT[] DEFAULT ARRAY['relates_to', 'supports', 'derived_from'],
  p_ef_search INT DEFAULT 100
)
RETURNS TABLE (id UUID, content TEXT, note_type TEXT, similarity FLOAT, is_expanded BOOLEAN, expansion_path TEXT[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search', p_ef_search::TEXT, true);
  RETURN QUERY
  WITH RECURSIVE
  direct_matches AS (
    SELECT n.id, n.content, n.note_type, 1 - (n.embedding <=> p_query_embedding) AS similarity,
           FALSE AS is_expanded, ARRAY[n.id::TEXT] AS expansion_path, 0 AS hop
    FROM spring_memory_notes n WHERE n.user_id = p_user_id AND n.status = 'active' AND n.embedding IS NOT NULL
    ORDER BY n.embedding <=> p_query_embedding LIMIT p_limit
  ),
  expanded AS (
    SELECT * FROM direct_matches
    UNION
    SELECT n.id, n.content, n.note_type, prev.similarity * e.weight AS similarity,
           TRUE AS is_expanded, prev.expansion_path || n.id::TEXT, prev.hop + 1
    FROM expanded prev
    JOIN spring_memory_edges e ON (e.src_memory_id = prev.id OR e.dst_memory_id = prev.id)
    JOIN spring_memory_notes n ON (n.id = CASE WHEN e.src_memory_id = prev.id THEN e.dst_memory_id ELSE e.src_memory_id END)
    WHERE prev.hop < p_expand_hops AND e.edge_type = ANY(p_edge_types)
      AND n.user_id = p_user_id AND n.status = 'active'
      AND NOT n.id = ANY(ARRAY(SELECT DISTINCT unnest(prev.expansion_path)::UUID))
  )
  SELECT DISTINCT ON (e.id) e.id, e.content, e.note_type, e.similarity::FLOAT, e.is_expanded, e.expansion_path
  FROM expanded e ORDER BY e.id, e.similarity DESC LIMIT p_limit * 2;
END; $$;

-- 12. Stats table
CREATE TABLE IF NOT EXISTS spring_vector_search_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  query_type TEXT NOT NULL, ef_search INT, top_k INT,
  had_scope_filter BOOLEAN DEFAULT FALSE, had_type_filter BOOLEAN DEFAULT FALSE, filter_count INT DEFAULT 0,
  results_count INT, avg_similarity FLOAT, min_similarity FLOAT, max_similarity FLOAT,
  execution_time_ms FLOAT, used_iterative_scan BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vector_search_stats_user_time ON spring_vector_search_stats(user_id, created_at DESC);
ALTER TABLE spring_vector_search_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own search stats' AND tablename = 'spring_vector_search_stats') THEN
  CREATE POLICY "Users can view own search stats" ON spring_vector_search_stats FOR SELECT USING (auth.uid()::text = user_id);
END IF; END $$;

-- 13. Health view
CREATE OR REPLACE VIEW spring_hnsw_index_health AS
SELECT i.indexrelname AS index_name, t.relname AS table_name, t.n_live_tup AS live_tuples, t.n_dead_tup AS dead_tuples,
       CASE WHEN t.n_dead_tup > t.n_live_tup * 0.1 THEN 'needs_vacuum' WHEN i.idx_scan = 0 AND t.n_live_tup > 100 THEN 'unused' ELSE 'healthy' END AS status,
       pg_size_pretty(pg_relation_size(i.indexrelid::regclass)) AS index_size, i.idx_scan AS total_scans
FROM pg_stat_user_indexes i JOIN pg_stat_user_tables t ON i.relid = t.relid
WHERE t.relname IN ('spring_memory_notes', 'spring_entities') AND (i.indexrelname LIKE '%hnsw%' OR i.indexrelname LIKE '%embedding%');
GRANT SELECT ON spring_hnsw_index_health TO authenticated;

-- 14. Backfill helper
CREATE OR REPLACE FUNCTION backfill_spring_notes_tsv(p_batch_size INT DEFAULT 1000) RETURNS INT AS $$
DECLARE affected INT;
BEGIN
  WITH to_update AS (SELECT id FROM spring_memory_notes WHERE content_tsv IS NULL AND content IS NOT NULL LIMIT p_batch_size FOR UPDATE SKIP LOCKED)
  UPDATE spring_memory_notes n SET content_tsv = to_tsvector('english', n.content) FROM to_update t WHERE n.id = t.id;
  GET DIAGNOSTICS affected = ROW_COUNT; RETURN affected;
END; $$ LANGUAGE plpgsql;

-- Done!
SELECT 'HNSW Migration Complete' AS status;
