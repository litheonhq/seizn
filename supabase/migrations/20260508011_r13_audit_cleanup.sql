-- R13 — R12 audit follow-up.
--
-- Locked 2026-05-08. Two SQL-side items:
--   1. (MED C6 from R11 audit) hybrid_search_memories was not patched in
--      R6 because the original ALTER FUNCTION ... SET hnsw.iterative_scan
--      attempted in R12 hit Supabase Management role privilege denial.
--      The R6 search_memories fix used a different mechanism — DROP +
--      CREATE OR REPLACE with the SET clauses embedded in the function
--      definition itself — which Supabase does allow. Apply the same
--      pattern to hybrid_search_memories so vector-half queries inherit
--      iterative_scan='relaxed_order'.
--
--      keyword_search_memories is intentionally NOT patched — it does not
--      use the embedding column or HNSW index (only ts_rank_cd over
--      content_tsv), so the iterative_scan GUC has no effect on its plan.
--
--   2. While we're here, also align search_path with R6 — the existing
--      hybrid_search_memories has SET search_path = public, but R6 added
--      'extensions' to search_memories to ensure pgvector operators
--      resolve under Supabase's hardened schema layout. Do the same here
--      to prevent surprise breakage if vector ops migrate fully to the
--      extensions schema.
--
-- Privilege note: this DROP+CREATE preserves the R12 grant posture —
-- after CREATE the function defaults to no anon/authenticated execute
-- (R12 revoked them for the search functions to lock down the
-- caller-supplied user_id arg). We re-REVOKE explicitly at the bottom
-- to make the contract obvious.
--
-- Rollback:
--   Recreate hybrid_search_memories from migration 20260421022 without
--   the SET hnsw.iterative_scan clauses.

BEGIN;

DROP FUNCTION IF EXISTS public.hybrid_search_memories(
  text, vector, text, integer, double precision, text, double precision, double precision
);

CREATE OR REPLACE FUNCTION public.hybrid_search_memories(
  query_text TEXT,
  query_embedding VECTOR(1024),
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  match_namespace TEXT DEFAULT NULL,
  keyword_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  keyword_rank FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET hnsw.iterative_scan TO 'relaxed_order'
SET hnsw.max_scan_tuples TO 20000
AS $$
  WITH vector_results AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.tags,
      m.namespace,
      m.importance,
      1 - (m.embedding <=> query_embedding) AS similarity
    FROM public.memories m
    WHERE m.user_id = match_user_id
      AND COALESCE(m.is_deleted, FALSE) = FALSE
      AND COALESCE(m.is_encrypted, FALSE) = FALSE
      AND m.embedding IS NOT NULL
      AND query_embedding IS NOT NULL
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND 1 - (m.embedding <=> query_embedding) > COALESCE(match_threshold, 0)
    ORDER BY m.embedding <=> query_embedding, m.created_at DESC
    LIMIT GREATEST(match_count, 1) * 2
  ),
  keyword_results AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.tags,
      m.namespace,
      m.importance,
      CASE
        WHEN COALESCE(query_text, '') = '' THEN 0::DOUBLE PRECISION
        ELSE ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text))::DOUBLE PRECISION
      END AS keyword_rank
    FROM public.memories m
    WHERE m.user_id = match_user_id
      AND COALESCE(m.is_deleted, FALSE) = FALSE
      AND COALESCE(m.is_encrypted, FALSE) = FALSE
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND (
        COALESCE(query_text, '') = ''
        OR m.content_tsv @@ plainto_tsquery('english', query_text)
      )
    ORDER BY keyword_rank DESC, m.created_at DESC
    LIMIT GREATEST(match_count, 1) * 2
  ),
  combined AS (
    SELECT
      COALESCE(v.id, k.id) AS id,
      COALESCE(v.content, k.content) AS content,
      COALESCE(v.memory_type, k.memory_type) AS memory_type,
      COALESCE(v.tags, k.tags) AS tags,
      COALESCE(v.namespace, k.namespace) AS namespace,
      COALESCE(v.importance, k.importance) AS importance,
      COALESCE(v.similarity, 0) AS similarity,
      COALESCE(k.keyword_rank, 0) AS keyword_rank,
      (
        COALESCE(vector_weight, 0.7) * COALESCE(v.similarity, 0)
        + COALESCE(keyword_weight, 0.3) * COALESCE(k.keyword_rank, 0)
      ) AS combined_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results k ON k.id = v.id
  )
  SELECT
    c.id,
    c.content,
    c.memory_type,
    c.tags,
    c.namespace,
    c.importance,
    c.similarity,
    c.keyword_rank,
    c.combined_score,
    m.created_at
  FROM combined c
  JOIN public.memories m ON m.id = c.id
  ORDER BY c.combined_score DESC, m.created_at DESC
  LIMIT GREATEST(match_count, 0);
$$;

-- Preserve R12 audit posture: the function is SECURITY DEFINER with a
-- caller-supplied user_id arg, so only service_role contexts should
-- invoke it.
REVOKE EXECUTE ON FUNCTION public.hybrid_search_memories(
  text, vector, text, integer, double precision, text, double precision, double precision
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hybrid_search_memories(
  text, vector, text, integer, double precision, text, double precision, double precision
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hybrid_search_memories(
  text, vector, text, integer, double precision, text, double precision, double precision
) TO service_role;

COMMENT ON FUNCTION public.hybrid_search_memories(
  text, vector, text, integer, double precision, text, double precision, double precision
) IS
  'R13 (2026-05-08): pgvector iterative_scan=relaxed_order pinned per-call. Filtered hybrid queries no longer overfilter HNSW candidates. Same pattern as R6 search_memories.';

NOTIFY pgrst, 'reload schema';

COMMIT;
