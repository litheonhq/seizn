-- Seizn Combo C - Semantic Cache
-- Migration: 049_combo_c_semantic_cache.sql
--
-- Tables:
-- - semantic_cache_entries: Cached retrieval results with semantic matching

-- ===========================================
-- 1) Semantic Cache Entries
-- ===========================================
CREATE TABLE IF NOT EXISTS semantic_cache_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Cache scope
  collection_id UUID REFERENCES summer_collections(id) ON DELETE CASCADE,
  namespace TEXT, -- Additional scoping beyond collection

  -- Query info
  query_text TEXT NOT NULL,
  query_hash TEXT NOT NULL, -- For exact match lookup
  query_embedding vector(1024), -- For semantic similarity lookup

  -- Normalized query (for deduplication)
  normalized_query TEXT,
  normalized_hash TEXT,

  -- Config snapshot at cache time
  config_hash TEXT, -- Hash of retrieval config
  config_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Cached results
  results JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example:
  -- [
  --   {"chunk_id": "...", "score": 0.92, "content": "...", "metadata": {...}},
  --   ...
  -- ]

  results_count INT NOT NULL DEFAULT 0,

  -- Cache metadata
  cache_key TEXT UNIQUE NOT NULL, -- Composite key for lookups
  similarity_threshold FLOAT NOT NULL DEFAULT 0.95, -- Min similarity for cache hit

  -- Quality indicators
  quality_score FLOAT, -- Estimated quality of cached results
  feedback_positive INT NOT NULL DEFAULT 0,
  feedback_negative INT NOT NULL DEFAULT 0,

  -- Usage stats
  hit_count INT NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,

  -- TTL and eviction
  ttl_seconds INT NOT NULL DEFAULT 86400, -- Default 24 hours
  expires_at TIMESTAMPTZ NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE, -- Pinned entries don't expire

  -- Invalidation tracking
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,

  -- Cost savings tracking
  embedding_cost_saved FLOAT NOT NULL DEFAULT 0,
  rerank_cost_saved FLOAT NOT NULL DEFAULT 0,
  latency_saved_ms INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for exact match lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_cache_cache_key
  ON semantic_cache_entries(cache_key)
  WHERE invalidated_at IS NULL;

-- Index for hash-based lookup
CREATE INDEX IF NOT EXISTS idx_semantic_cache_query_hash
  ON semantic_cache_entries(user_id, collection_id, query_hash)
  WHERE invalidated_at IS NULL AND expires_at > NOW();

-- Index for semantic similarity search
CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding
  ON semantic_cache_entries
  USING hnsw (query_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE query_embedding IS NOT NULL AND invalidated_at IS NULL;

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_semantic_cache_expires
  ON semantic_cache_entries(expires_at)
  WHERE invalidated_at IS NULL AND is_pinned = FALSE;

-- Index for user stats
CREATE INDEX IF NOT EXISTS idx_semantic_cache_user
  ON semantic_cache_entries(user_id, created_at DESC);

-- Index for collection-based invalidation
CREATE INDEX IF NOT EXISTS idx_semantic_cache_collection
  ON semantic_cache_entries(collection_id, created_at DESC)
  WHERE collection_id IS NOT NULL;

-- ===========================================
-- 2) RLS Policies
-- ===========================================
ALTER TABLE semantic_cache_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own semantic_cache_entries"
  ON semantic_cache_entries FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own semantic_cache_entries"
  ON semantic_cache_entries FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own semantic_cache_entries"
  ON semantic_cache_entries FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own semantic_cache_entries"
  ON semantic_cache_entries FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- ===========================================
-- 3) Helper Functions
-- ===========================================

-- Look up cache by exact hash
CREATE OR REPLACE FUNCTION lookup_cache_exact(
  p_user_id TEXT,
  p_collection_id UUID,
  p_query_hash TEXT
)
RETURNS TABLE (
  id UUID,
  query_text TEXT,
  results JSONB,
  results_count INT,
  quality_score FLOAT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Update hit count and return
  RETURN QUERY
  UPDATE semantic_cache_entries
  SET
    hit_count = hit_count + 1,
    last_hit_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND collection_id = p_collection_id
    AND query_hash = p_query_hash
    AND invalidated_at IS NULL
    AND expires_at > NOW()
  RETURNING
    semantic_cache_entries.id,
    semantic_cache_entries.query_text,
    semantic_cache_entries.results,
    semantic_cache_entries.results_count,
    semantic_cache_entries.quality_score,
    semantic_cache_entries.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Look up cache by semantic similarity
CREATE OR REPLACE FUNCTION lookup_cache_semantic(
  p_user_id TEXT,
  p_collection_id UUID,
  p_query_embedding vector(1024),
  p_similarity_threshold FLOAT DEFAULT 0.95
)
RETURNS TABLE (
  id UUID,
  query_text TEXT,
  results JSONB,
  results_count INT,
  similarity FLOAT,
  quality_score FLOAT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.query_text,
    c.results,
    c.results_count,
    (1 - (c.query_embedding <=> p_query_embedding))::FLOAT AS similarity,
    c.quality_score,
    c.created_at
  FROM semantic_cache_entries c
  WHERE c.user_id = p_user_id
    AND c.collection_id = p_collection_id
    AND c.query_embedding IS NOT NULL
    AND c.invalidated_at IS NULL
    AND c.expires_at > NOW()
    AND (1 - (c.query_embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY c.query_embedding <=> p_query_embedding
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record cache hit
CREATE OR REPLACE FUNCTION record_cache_hit(
  p_cache_id UUID,
  p_latency_saved_ms INT DEFAULT 0,
  p_embedding_cost_saved FLOAT DEFAULT 0,
  p_rerank_cost_saved FLOAT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE semantic_cache_entries
  SET
    hit_count = hit_count + 1,
    last_hit_at = NOW(),
    latency_saved_ms = latency_saved_ms + p_latency_saved_ms,
    embedding_cost_saved = embedding_cost_saved + p_embedding_cost_saved,
    rerank_cost_saved = rerank_cost_saved + p_rerank_cost_saved,
    updated_at = NOW()
  WHERE id = p_cache_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record feedback
CREATE OR REPLACE FUNCTION record_cache_feedback(
  p_cache_id UUID,
  p_user_id TEXT,
  p_is_positive BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  IF p_is_positive THEN
    UPDATE semantic_cache_entries
    SET
      feedback_positive = feedback_positive + 1,
      quality_score = LEAST(1.0, COALESCE(quality_score, 0.5) + 0.05),
      updated_at = NOW()
    WHERE id = p_cache_id AND user_id = p_user_id;
  ELSE
    UPDATE semantic_cache_entries
    SET
      feedback_negative = feedback_negative + 1,
      quality_score = GREATEST(0.0, COALESCE(quality_score, 0.5) - 0.1),
      updated_at = NOW()
    WHERE id = p_cache_id AND user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Invalidate cache for a collection
CREATE OR REPLACE FUNCTION invalidate_cache_for_collection(
  p_collection_id UUID,
  p_reason TEXT DEFAULT 'collection_updated'
)
RETURNS INT AS $$
DECLARE
  v_invalidated INT;
BEGIN
  WITH updated AS (
    UPDATE semantic_cache_entries
    SET
      invalidated_at = NOW(),
      invalidation_reason = p_reason,
      updated_at = NOW()
    WHERE collection_id = p_collection_id
      AND invalidated_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_invalidated FROM updated;

  RETURN v_invalidated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache(p_batch_size INT DEFAULT 1000)
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH deleted AS (
    DELETE FROM semantic_cache_entries
    WHERE (expires_at < NOW() AND is_pinned = FALSE)
       OR invalidated_at < NOW() - INTERVAL '7 days'
      AND id IN (
        SELECT id FROM semantic_cache_entries
        WHERE (expires_at < NOW() AND is_pinned = FALSE)
           OR invalidated_at < NOW() - INTERVAL '7 days'
        LIMIT p_batch_size
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cache stats
CREATE OR REPLACE FUNCTION get_cache_stats(
  p_user_id TEXT,
  p_collection_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_entries BIGINT,
  active_entries BIGINT,
  total_hits BIGINT,
  total_latency_saved_ms BIGINT,
  total_cost_saved FLOAT,
  avg_quality_score FLOAT,
  hit_rate_estimate FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_entries,
    COUNT(*) FILTER (WHERE invalidated_at IS NULL AND expires_at > NOW())::BIGINT AS active_entries,
    SUM(hit_count)::BIGINT AS total_hits,
    SUM(latency_saved_ms)::BIGINT AS total_latency_saved_ms,
    SUM(embedding_cost_saved + rerank_cost_saved)::FLOAT AS total_cost_saved,
    AVG(quality_score)::FLOAT AS avg_quality_score,
    CASE
      WHEN COUNT(*) > 0 THEN (SUM(hit_count)::FLOAT / COUNT(*)::FLOAT)
      ELSE 0
    END AS hit_rate_estimate
  FROM semantic_cache_entries
  WHERE user_id = p_user_id
    AND (p_collection_id IS NULL OR collection_id = p_collection_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 4) Triggers
-- ===========================================

CREATE OR REPLACE FUNCTION update_semantic_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_semantic_cache_updated ON semantic_cache_entries;
CREATE TRIGGER trigger_semantic_cache_updated
  BEFORE UPDATE ON semantic_cache_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_semantic_cache_updated_at();

-- Auto-set expires_at based on ttl
CREATE OR REPLACE FUNCTION set_cache_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at = NEW.created_at + (NEW.ttl_seconds || ' seconds')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_cache_expires ON semantic_cache_entries;
CREATE TRIGGER trigger_set_cache_expires
  BEFORE INSERT ON semantic_cache_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_cache_expires_at();

-- ===========================================
-- 5) Views
-- ===========================================

CREATE OR REPLACE VIEW cache_stats_daily AS
SELECT
  user_id,
  collection_id,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS entries_created,
  SUM(hit_count) AS total_hits,
  SUM(latency_saved_ms) AS latency_saved_ms,
  SUM(embedding_cost_saved + rerank_cost_saved) AS cost_saved
FROM semantic_cache_entries
GROUP BY user_id, collection_id, DATE_TRUNC('day', created_at);

GRANT SELECT ON cache_stats_daily TO authenticated;

-- ===========================================
-- 6) Comments
-- ===========================================
COMMENT ON TABLE semantic_cache_entries IS 'Semantic cache for retrieval results with similarity-based lookup';
COMMENT ON COLUMN semantic_cache_entries.query_embedding IS 'Vector embedding for semantic similarity matching';
COMMENT ON COLUMN semantic_cache_entries.similarity_threshold IS 'Minimum similarity score for cache hit';
COMMENT ON COLUMN semantic_cache_entries.cache_key IS 'Composite key for fast exact-match lookups';
COMMENT ON COLUMN semantic_cache_entries.is_pinned IS 'Pinned entries do not expire';
COMMENT ON FUNCTION lookup_cache_exact IS 'Exact hash-based cache lookup';
COMMENT ON FUNCTION lookup_cache_semantic IS 'Semantic similarity-based cache lookup';
COMMENT ON FUNCTION record_cache_hit IS 'Record a cache hit with savings';
COMMENT ON FUNCTION record_cache_feedback IS 'Record user feedback on cache quality';
COMMENT ON FUNCTION invalidate_cache_for_collection IS 'Invalidate all cache for a collection';
COMMENT ON FUNCTION cleanup_expired_cache IS 'Remove expired cache entries';
COMMENT ON FUNCTION get_cache_stats IS 'Get cache statistics for a user';
