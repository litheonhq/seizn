-- Migration: 20260215_e2e_memory_encryption.sql
-- Description: Add E2E encryption support for confidential memories.
--
-- Key points:
-- - Server stores ciphertext only in `memories.encrypted_content`
-- - `memories.content` is set to "[encrypted]" placeholder for legacy clients
-- - Encrypted memories are excluded from all search RPCs
-- - PIN-derived key material is never stored; only salt + verification block are stored in `profiles`

-- ============================================================================
-- 1) Schema: memories
-- ============================================================================

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false;

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS encrypted_content text;

CREATE INDEX IF NOT EXISTS idx_memories_user_encrypted
  ON public.memories (user_id, is_encrypted)
  WHERE is_encrypted = true;

-- ============================================================================
-- 2) Schema: profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS e2e_salt text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS e2e_verification_block text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS e2e_setup_at timestamptz;

-- ============================================================================
-- 3) Search RPCs: exclude encrypted memories
-- ============================================================================

-- NOTE: These functions are used by /api/v1/memories and multiple internal callers.
-- Encrypted memories must not appear in search results (no embeddings and content is placeholder).

-- keyword_search_memories
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
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.tags,
    m.namespace,
    m.importance,
    ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) AS rank,
    m.created_at
  FROM public.memories m
  WHERE m.user_id = match_user_id::UUID
    AND m.is_deleted = false
    AND m.is_encrypted = false
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND m.content_tsv @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- hybrid_search_memories
CREATE OR REPLACE FUNCTION public.hybrid_search_memories(
  query_text TEXT,
  query_embedding vector(1024),
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
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  k CONSTANT INT := 60;
BEGIN
  RETURN QUERY
  WITH
  vector_results AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.tags,
      m.namespace,
      m.importance,
      1 - (m.embedding <=> query_embedding) AS vec_similarity,
      ROW_NUMBER() OVER (ORDER BY m.embedding <=> query_embedding) AS vec_rank
    FROM public.memories m
    WHERE m.user_id = match_user_id::UUID
      AND m.is_deleted = false
      AND m.is_encrypted = false
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_results AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.tags,
      m.namespace,
      m.importance,
      ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) AS kw_rank,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) DESC
      ) AS kw_row_rank
    FROM public.memories m
    WHERE m.user_id = match_user_id::UUID
      AND m.is_deleted = false
      AND m.is_encrypted = false
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND m.content_tsv @@ plainto_tsquery('english', query_text)
    ORDER BY ts_rank_cd(m.content_tsv, plainto_tsquery('english', query_text)) DESC
    LIMIT match_count * 2
  ),
  combined AS (
    SELECT
      COALESCE(v.id, kw.id) AS id,
      COALESCE(v.content, kw.content) AS content,
      COALESCE(v.memory_type, kw.memory_type) AS memory_type,
      COALESCE(v.tags, kw.tags) AS tags,
      COALESCE(v.namespace, kw.namespace) AS namespace,
      COALESCE(v.importance, kw.importance) AS importance,
      COALESCE(v.vec_similarity, 0) AS similarity,
      COALESCE(kw.kw_rank, 0) AS keyword_rank,
      (
        vector_weight * (1.0 / (k + COALESCE(v.vec_rank, match_count * 2))) +
        keyword_weight * (1.0 / (k + COALESCE(kw.kw_row_rank, match_count * 2)))
      ) AS combined_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results kw ON v.id = kw.id
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
  JOIN public.memories m ON c.id = m.id
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- search_memories (vector-only search)
CREATE OR REPLACE FUNCTION public.search_memories(
  query_embedding vector(1024),
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
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
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
  WHERE m.user_id = match_user_id::UUID
    AND m.is_deleted = false
    AND m.is_encrypted = false
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify PostgREST to reload schema cache (helps Supabase clients pick up new columns)
NOTIFY pgrst, 'reload schema';

