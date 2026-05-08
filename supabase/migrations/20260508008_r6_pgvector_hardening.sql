-- R6 — pgvector 0.8 hardening.
--
-- Locked 2026-05-08. Three concrete wins:
--   1. memories.embedding has NO vector index today (1,235 rows; growing).
--      /api/v1/memories search hits sequential scan. Add HNSW now before
--      it bites prod latency.
--   2. Filtered queries (user_id, namespace, is_deleted, is_encrypted) on
--      top of HNSW need iterative_scan to avoid silent overfilter — HNSW
--      returns its top-K candidates, then the WHERE clause filters them
--      down, sometimes leaving fewer rows than the caller asked for.
--      pgvector 0.8.0+ ships hnsw.iterative_scan; default is 'off'.
--   3. search_memories() is the single hot RPC. Pinning iterative_scan
--      via SET LOCAL inside the function makes it deterministic across
--      pgbouncer's pooled connections that may not pick up the database-
--      level default.
--
-- Skipped this round (logged for follow-up):
--   - halfvec migration on memories.embedding — saves ~50% index memory
--     but requires call-site cast or column type change; defer until
--     query call sites are inventoried in R9.
--   - paper_embeddings — vector column with no index; check if live
--     before adding (zero rows in 30d).
--   - nih_grant_embeddings — 15,993 rows, zero new in 30d; legacy
--     research data, no action.
--
-- Rollback plan:
--   DROP INDEX IF EXISTS public.idx_memories_embedding_hnsw;
--   ALTER DATABASE postgres RESET hnsw.iterative_scan;
--   ALTER DATABASE postgres RESET hnsw.max_scan_tuples;
--   (search_memories revert: re-run pre-R6 definition from migration history.)

BEGIN;

-- 1. HNSW on memories.embedding with partial filter matching the hot
--    search predicate. Partial index keeps the structure smaller and
--    higher-quality (only live, non-encrypted rows).
CREATE INDEX IF NOT EXISTS idx_memories_embedding_hnsw
  ON public.memories USING hnsw (embedding vector_cosine_ops)
  WHERE NOT COALESCE(is_deleted, FALSE)
    AND NOT COALESCE(is_encrypted, FALSE);

-- 2. Database-level iterative_scan defaults. New sessions pick this up.
--    'relaxed_order' is the right mode here: search_memories applies a
--    threshold + LIMIT after retrieval, so we don't depend on perfect
--    cosine ordering — we just want enough candidate rows after WHERE.
ALTER DATABASE postgres SET hnsw.iterative_scan = 'relaxed_order';
ALTER DATABASE postgres SET hnsw.max_scan_tuples = 20000;

-- 3. Pin the GUC inside search_memories so behavior is deterministic
--    even on pooled connections that bypass the database default.
--    Function body is unchanged; only the SET clause is added.
DROP FUNCTION IF EXISTS public.search_memories(vector, text, integer, double precision, text);

CREATE OR REPLACE FUNCTION public.search_memories(
  query_embedding vector,
  match_user_id text,
  match_count integer DEFAULT 10,
  match_threshold double precision DEFAULT 0.7,
  match_namespace text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  content text,
  memory_type text,
  tags text[],
  namespace text,
  importance integer,
  similarity double precision,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET hnsw.iterative_scan TO 'relaxed_order'
SET hnsw.max_scan_tuples TO 20000
AS $$
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.tags,
    m.namespace,
    m.importance,
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.created_at
  FROM public.memories m
  WHERE m.user_id = match_user_id
    AND COALESCE(m.is_deleted, FALSE) = FALSE
    AND COALESCE(m.is_encrypted, FALSE) = FALSE
    AND m.embedding IS NOT NULL
    AND query_embedding IS NOT NULL
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND 1 - (m.embedding <=> query_embedding) > COALESCE(match_threshold, 0)
  ORDER BY m.embedding <=> query_embedding, m.created_at DESC
  LIMIT GREATEST(match_count, 0);
$$;

COMMENT ON INDEX public.idx_memories_embedding_hnsw IS
  'R6 (2026-05-08): HNSW vector index for /api/v1/memories search. Partial on NOT is_deleted AND NOT is_encrypted. Combined with hnsw.iterative_scan=relaxed_order for filtered-query overfilter prevention.';

COMMIT;
