-- ============================================================================
-- PGroonga Hybrid Search Migration
--
-- Enables PGroonga for multilingual full-text search and implements
-- Reciprocal Rank Fusion (RRF) to combine dense (pgvector) and
-- lexical (PGroonga) results.
--
-- PGroonga supports CJK tokenization, Hangul, Devanagari, Cyrillic,
-- Arabic, and other scripts out of the box via Groonga's tokenizers.
--
-- Based on: Seizn_Multilingual_AI_Memory_WebResearch_Integration_Playbook.md
-- Created: 2026-02-06
-- ============================================================================

-- ============================================================================
-- 1. Enable PGroonga extension
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgroonga;

-- ============================================================================
-- 2. Create PGroonga indexes on spring_memory_notes
-- ============================================================================

-- Full-text index on content (supports CJK, Hangul, Devanagari, etc.)
CREATE INDEX IF NOT EXISTS idx_spring_notes_pgroonga_content
ON spring_memory_notes
USING pgroonga(content)
WITH (
  tokenizer = 'TokenBigramSplitSymbolAlphaDigit'
)
WHERE status = 'active';

-- Full-text index on canonical English content
CREATE INDEX IF NOT EXISTS idx_spring_notes_pgroonga_canonical
ON spring_memory_notes
USING pgroonga(content_canonical_en)
WITH (
  tokenizer = 'TokenBigramSplitSymbolAlphaDigit'
)
WHERE status = 'active' AND content_canonical_en IS NOT NULL;

-- ============================================================================
-- 3. Hybrid search function (Dense + Lexical + RRF)
-- ============================================================================

CREATE OR REPLACE FUNCTION search_memories_hybrid(
  p_user_id TEXT,
  p_query_embedding VECTOR(1024),
  p_query_text TEXT,
  p_language VARCHAR(10) DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_rrf_k INT DEFAULT 60,
  p_dense_weight FLOAT DEFAULT 0.6,
  p_lexical_weight FLOAT DEFAULT 0.4,
  p_min_similarity FLOAT DEFAULT 0.3,
  p_use_canonical BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type VARCHAR,
  status VARCHAR,
  tags TEXT[],
  language VARCHAR(10),
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT,
  matched_by TEXT,
  matched_repr TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_fetch_limit INT := p_limit * 3;  -- Oversample for RRF merge
BEGIN
  RETURN QUERY
  WITH
  -- Dense search via pgvector HNSW
  dense_results AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.status,
      n.tags,
      n.language,
      (1 - (n.embedding <=> p_query_embedding))::FLOAT AS score,
      'raw'::TEXT AS repr,
      n.created_at,
      ROW_NUMBER() OVER (ORDER BY n.embedding <=> p_query_embedding) AS rank
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.embedding IS NOT NULL
      AND (p_language IS NULL OR n.language = p_language)
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT v_fetch_limit
  ),
  -- Dense search on canonical embeddings (for cross-lingual)
  canonical_dense AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.status,
      n.tags,
      n.language,
      (1 - (n.embedding_canonical <=> p_query_embedding))::FLOAT AS score,
      'canonical'::TEXT AS repr,
      n.created_at,
      ROW_NUMBER() OVER (ORDER BY n.embedding_canonical <=> p_query_embedding) AS rank
    FROM spring_memory_notes n
    WHERE p_use_canonical
      AND n.user_id = p_user_id
      AND n.status = 'active'
      AND n.embedding_canonical IS NOT NULL
      AND (p_language IS NULL OR n.language = p_language)
    ORDER BY n.embedding_canonical <=> p_query_embedding
    LIMIT v_fetch_limit
  ),
  -- Lexical search via PGroonga on content
  lexical_results AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.status,
      n.tags,
      n.language,
      pgroonga_score(tableoid, ctid)::FLOAT AS score,
      'raw'::TEXT AS repr,
      n.created_at,
      ROW_NUMBER() OVER (ORDER BY pgroonga_score(tableoid, ctid) DESC) AS rank
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.content &@~ p_query_text
      AND (p_language IS NULL OR n.language = p_language)
    LIMIT v_fetch_limit
  ),
  -- Lexical search on canonical English content
  canonical_lexical AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.status,
      n.tags,
      n.language,
      pgroonga_score(tableoid, ctid)::FLOAT AS score,
      'canonical'::TEXT AS repr,
      n.created_at,
      ROW_NUMBER() OVER (ORDER BY pgroonga_score(tableoid, ctid) DESC) AS rank
    FROM spring_memory_notes n
    WHERE p_use_canonical
      AND n.user_id = p_user_id
      AND n.status = 'active'
      AND n.content_canonical_en IS NOT NULL
      AND n.content_canonical_en &@~ p_query_text
      AND (p_language IS NULL OR n.language = p_language)
    LIMIT v_fetch_limit
  ),
  -- RRF: compute reciprocal rank scores for each source
  all_dense AS (
    SELECT id, score, repr, rank FROM dense_results
    UNION ALL
    SELECT id, score, repr, rank FROM canonical_dense
  ),
  all_lexical AS (
    SELECT id, score, repr, rank FROM lexical_results
    UNION ALL
    SELECT id, score, repr, rank FROM canonical_lexical
  ),
  -- Best dense rank per document
  best_dense AS (
    SELECT
      id,
      MIN(rank) AS best_rank,
      MAX(score) AS best_score,
      (ARRAY_AGG(repr ORDER BY rank))[1] AS best_repr
    FROM all_dense
    GROUP BY id
  ),
  -- Best lexical rank per document
  best_lexical AS (
    SELECT
      id,
      MIN(rank) AS best_rank,
      MAX(score) AS best_score,
      (ARRAY_AGG(repr ORDER BY rank))[1] AS best_repr
    FROM all_lexical
    GROUP BY id
  ),
  -- All unique document IDs
  all_ids AS (
    SELECT id FROM best_dense
    UNION
    SELECT id FROM best_lexical
  ),
  -- Compute RRF combined score
  rrf_scores AS (
    SELECT
      a.id,
      COALESCE(d.best_score, 0) AS semantic_score,
      COALESCE(l.best_score, 0) AS keyword_score,
      -- RRF formula: sum of 1/(k + rank) weighted by source weight
      (
        p_dense_weight * COALESCE(1.0 / (p_rrf_k + d.best_rank), 0) +
        p_lexical_weight * COALESCE(1.0 / (p_rrf_k + l.best_rank), 0)
      )::FLOAT AS combined_score,
      CASE
        WHEN d.id IS NOT NULL AND l.id IS NOT NULL THEN 'both'
        WHEN d.id IS NOT NULL THEN 'dense'
        ELSE 'lexical'
      END AS matched_by,
      COALESCE(d.best_repr, l.best_repr, 'raw') AS matched_repr
    FROM all_ids a
    LEFT JOIN best_dense d ON d.id = a.id
    LEFT JOIN best_lexical l ON l.id = a.id
  )
  -- Final join to get full document data
  SELECT
    n.id,
    n.content,
    n.note_type,
    n.status,
    n.tags,
    n.language,
    r.semantic_score,
    r.keyword_score,
    r.combined_score,
    r.matched_by,
    r.matched_repr,
    n.created_at
  FROM rrf_scores r
  JOIN spring_memory_notes n ON n.id = r.id
  WHERE r.combined_score > 0
    AND (r.semantic_score >= p_min_similarity OR r.keyword_score > 0)
  ORDER BY r.combined_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. Comments
-- ============================================================================

COMMENT ON FUNCTION search_memories_hybrid IS
  'Hybrid search combining pgvector dense search with PGroonga lexical search via Reciprocal Rank Fusion (RRF). Supports cross-lingual search through canonical embeddings and translations.';

COMMENT ON INDEX idx_spring_notes_pgroonga_content IS
  'PGroonga full-text index on content for multilingual lexical search (CJK, Hangul, Devanagari, Cyrillic, etc.)';

COMMENT ON INDEX idx_spring_notes_pgroonga_canonical IS
  'PGroonga full-text index on canonical English translations for cross-lingual lexical search';
