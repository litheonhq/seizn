-- Migration: 20260302001_search_bounded_rpc_wrappers.sql
-- Description: Add bounded search RPC wrappers that apply per-query statement timeout at SQL layer.
--
-- Why wrappers?
-- - Keep existing RPC signatures/backward compatibility intact.
-- - Allow API layer to opt into DB-side query budget without changing current callers.
--
-- Notes:
-- - statement_timeout is set LOCAL to the current transaction via set_config(..., true).
-- - Wrappers call existing public.search/keyword/hybrid functions.

CREATE OR REPLACE FUNCTION public.keyword_search_memories_bounded(
  query_text TEXT,
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_namespace TEXT DEFAULT NULL,
  statement_timeout_ms INT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  rank FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF statement_timeout_ms IS NOT NULL AND statement_timeout_ms > 0 THEN
    PERFORM set_config('statement_timeout', statement_timeout_ms::TEXT, true);
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.keyword_search_memories(
    query_text,
    match_user_id,
    match_count,
    match_namespace
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hybrid_search_memories_bounded(
  query_text TEXT,
  query_embedding vector(1024),
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  match_namespace TEXT DEFAULT NULL,
  keyword_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.7,
  statement_timeout_ms INT DEFAULT NULL
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
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF statement_timeout_ms IS NOT NULL AND statement_timeout_ms > 0 THEN
    PERFORM set_config('statement_timeout', statement_timeout_ms::TEXT, true);
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.hybrid_search_memories(
    query_text,
    query_embedding,
    match_user_id,
    match_count,
    match_threshold,
    match_namespace,
    keyword_weight,
    vector_weight
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.search_memories_bounded(
  query_embedding vector(1024),
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  match_namespace TEXT DEFAULT NULL,
  statement_timeout_ms INT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF statement_timeout_ms IS NOT NULL AND statement_timeout_ms > 0 THEN
    PERFORM set_config('statement_timeout', statement_timeout_ms::TEXT, true);
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.search_memories(
    query_embedding,
    match_user_id,
    match_count,
    match_threshold,
    match_namespace
  );
END;
$$;

-- Keep search_path fixed for Security Advisor.
ALTER FUNCTION public.keyword_search_memories_bounded(TEXT, TEXT, INT, TEXT, INT)
  SET search_path = '';
ALTER FUNCTION public.hybrid_search_memories_bounded(TEXT, vector(1024), TEXT, INT, FLOAT, TEXT, FLOAT, FLOAT, INT)
  SET search_path = '';
ALTER FUNCTION public.search_memories_bounded(vector(1024), TEXT, INT, FLOAT, TEXT, INT)
  SET search_path = '';

NOTIFY pgrst, 'reload schema';
