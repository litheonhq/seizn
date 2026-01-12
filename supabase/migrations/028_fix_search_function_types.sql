-- Fix summer_search_chunks function return type mismatch
-- The <=> operator returns REAL, but we declared FLOAT (double precision)

DROP FUNCTION IF EXISTS summer_search_chunks(vector, TEXT, UUID, INT, FLOAT, INT);

CREATE OR REPLACE FUNCTION summer_search_chunks(
  query_embedding vector(1024),
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10,
  match_threshold REAL DEFAULT 0.5,
  search_ef INT DEFAULT 40
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity REAL,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::REAL AS similarity,
    c.created_at
  FROM summer_chunks c
  WHERE c.user_id = match_user_id
    AND c.collection_id = match_collection_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix summer_hybrid_search_chunks if it has similar issues
DROP FUNCTION IF EXISTS summer_hybrid_search_chunks(TEXT, vector, TEXT, UUID, INT, FLOAT, FLOAT, FLOAT, INT);

CREATE OR REPLACE FUNCTION summer_hybrid_search_chunks(
  query_text TEXT,
  query_embedding vector(1024),
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10,
  match_threshold REAL DEFAULT 0.5,
  keyword_weight REAL DEFAULT 0.3,
  vector_weight REAL DEFAULT 0.7,
  search_ef INT DEFAULT 40
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity REAL,
  keyword_rank REAL,
  combined_score REAL,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

  RETURN QUERY
  WITH vector_results AS (
    SELECT
      c.id,
      c.document_id,
      c.content,
      c.metadata,
      (1 - (c.embedding <=> query_embedding))::REAL AS sim,
      c.created_at
    FROM summer_chunks c
    WHERE c.user_id = match_user_id
      AND c.collection_id = match_collection_id
      AND c.embedding IS NOT NULL
      AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_results AS (
    SELECT
      c.id,
      ts_rank_cd(to_tsvector('simple', c.content), plainto_tsquery('simple', query_text))::REAL AS kw_rank
    FROM summer_chunks c
    WHERE c.user_id = match_user_id
      AND c.collection_id = match_collection_id
      AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', query_text)
  )
  SELECT
    v.id AS chunk_id,
    v.document_id,
    v.content,
    v.metadata,
    v.sim AS similarity,
    COALESCE(k.kw_rank, 0::REAL) AS keyword_rank,
    (v.sim * vector_weight + COALESCE(k.kw_rank, 0::REAL) * keyword_weight)::REAL AS combined_score,
    v.created_at
  FROM vector_results v
  LEFT JOIN keyword_results k ON v.id = k.id
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
