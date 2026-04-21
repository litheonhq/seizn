-- Migration: 20260421022_runtime_verification_guardrails.sql
-- Description: Restore runtime DB verification guardrails on the text user_id schema.

CREATE OR REPLACE FUNCTION public.keyword_search_memories(
  query_text TEXT,
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  rank FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.tags,
    m.namespace,
    m.importance,
    ts_rank_cd(m.content_tsv, plainto_tsquery('english', COALESCE(query_text, ''))) AS rank,
    m.created_at
  FROM public.memories m
  WHERE m.user_id = match_user_id
    AND COALESCE(m.is_deleted, FALSE) = FALSE
    AND COALESCE(m.is_encrypted, FALSE) = FALSE
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND COALESCE(query_text, '') <> ''
    AND m.content_tsv @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC, m.created_at DESC
  LIMIT GREATEST(match_count, 0);
$$;

CREATE OR REPLACE FUNCTION public.search_memories(
  query_embedding VECTOR(1024),
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.keyword_search_memories(TEXT, TEXT, INT, TEXT)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_memories(VECTOR(1024), TEXT, INT, FLOAT, TEXT)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_search_memories(TEXT, VECTOR(1024), TEXT, INT, FLOAT, TEXT, FLOAT, FLOAT)
  TO anon, authenticated, service_role;

ALTER VIEW public.flight_recorder_traces
  SET (security_invoker = true);

REVOKE ALL ON public.flight_recorder_traces FROM PUBLIC;
REVOKE ALL ON public.flight_recorder_traces FROM anon;
REVOKE ALL ON public.flight_recorder_traces FROM authenticated;
GRANT SELECT ON public.flight_recorder_traces TO service_role;

NOTIFY pgrst, 'reload schema';
