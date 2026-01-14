-- Seizn Phase B2 - Cost Engineering
-- Migration: 20260114_002_cost_engineering.sql
--
-- Tables:
-- - cost_chunk_access: Chunk access statistics for tiering
-- - cost_query_cache: Query result cache with semantic matching
-- - cost_cache_metrics: Cache hit/miss metrics per user
-- - cost_recommendations: Autopilot cost optimization recommendations
--
-- This feature enables intelligent cost optimization through:
-- - Hot/warm/cold chunk tiering based on access patterns
-- - Semantic query caching to reduce redundant processing
-- - AI-powered cost optimization recommendations

-- ===========================================
-- 1) Chunk Access Stats (for Tiering)
-- ===========================================
CREATE TABLE IF NOT EXISTS cost_chunk_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Chunk identification
  chunk_id TEXT NOT NULL,
  collection_id UUID REFERENCES summer_collections(id) ON DELETE CASCADE,

  -- Access tracking
  access_count INTEGER NOT NULL DEFAULT 1,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tiering
  current_tier TEXT NOT NULL DEFAULT 'hot'
    CHECK (current_tier IN ('hot', 'warm', 'cold', 'archive')),

  -- Tier transition history
  tier_changed_at TIMESTAMPTZ DEFAULT NOW(),
  previous_tier TEXT,

  -- Access pattern metrics
  avg_daily_access FLOAT DEFAULT 0,
  peak_access_hour INTEGER, -- 0-23 hour with most access

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  CONSTRAINT cost_chunk_access_unique UNIQUE (user_id, chunk_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_chunk_access_user
  ON cost_chunk_access(user_id, last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_chunk_access_collection
  ON cost_chunk_access(collection_id, last_accessed_at DESC)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_chunk_access_tier
  ON cost_chunk_access(user_id, current_tier);

CREATE INDEX IF NOT EXISTS idx_cost_chunk_access_cold_candidates
  ON cost_chunk_access(last_accessed_at)
  WHERE current_tier = 'hot';
    

-- ===========================================
-- 2) Query Cache
-- ===========================================
CREATE TABLE IF NOT EXISTS cost_query_cache (
  -- Primary key is cache_key for fast lookup
  cache_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Query info
  query_text TEXT,
  query_embedding_hash TEXT,

  -- Versioning for invalidation
  index_version TEXT NOT NULL,
  policy_hash TEXT NOT NULL,

  -- Cached result
  result JSONB NOT NULL,
  -- Example:
  -- {"chunks": [...], "scores": [...], "metadata": {...}}

  -- Semantic matching support
  embedding vector(1024),

  -- Cache stats
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,

  -- TTL
  ttl_seconds INTEGER NOT NULL DEFAULT 3600, -- 1 hour default
  expires_at TIMESTAMPTZ NOT NULL,

  -- Cost savings tracking
  latency_saved_ms INTEGER NOT NULL DEFAULT 0,
  tokens_saved INTEGER NOT NULL DEFAULT 0,
  cost_saved_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_query_cache_user
  ON cost_query_cache(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_query_cache_expires
  ON cost_query_cache(expires_at);
  

CREATE INDEX IF NOT EXISTS idx_cost_query_cache_hash
  ON cost_query_cache(user_id, query_embedding_hash, index_version, policy_hash);
  

-- Semantic similarity search index
CREATE INDEX IF NOT EXISTS idx_cost_query_cache_embedding
  ON cost_query_cache
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- ===========================================
-- 3) Cache Metrics
-- ===========================================
CREATE TABLE IF NOT EXISTS cost_cache_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,

  -- Hit/miss counts
  hit_count INTEGER NOT NULL DEFAULT 0,
  miss_count INTEGER NOT NULL DEFAULT 0,

  -- Detailed metrics
  semantic_hit_count INTEGER NOT NULL DEFAULT 0, -- Hits via semantic similarity
  exact_hit_count INTEGER NOT NULL DEFAULT 0, -- Hits via exact hash match

  -- Savings tracking
  total_latency_saved_ms BIGINT NOT NULL DEFAULT 0,
  total_tokens_saved BIGINT NOT NULL DEFAULT 0,
  total_cost_saved_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,

  -- Time-based metrics (for trends)
  last_hour_hits INTEGER NOT NULL DEFAULT 0,
  last_hour_misses INTEGER NOT NULL DEFAULT 0,
  last_hour_reset_at TIMESTAMPTZ DEFAULT NOW(),

  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_cache_metrics_user
  ON cost_cache_metrics(user_id);

-- ===========================================
-- 4) Autopilot Cost Recommendations
-- ===========================================
CREATE TABLE IF NOT EXISTS cost_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Scope
  collection_id UUID REFERENCES summer_collections(id) ON DELETE CASCADE,

  -- Recommendation type
  type TEXT NOT NULL
    CHECK (type IN ('caching', 'tiering', 'query_optimization', 'model_selection', 'batch_processing', 'pruning')),

  -- Content
  title TEXT NOT NULL,
  description TEXT,

  -- Impact assessment
  impact TEXT NOT NULL DEFAULT 'medium'
    CHECK (impact IN ('low', 'medium', 'high', 'critical')),

  estimated_savings_usd DECIMAL(10, 4),
  estimated_savings_percent DECIMAL(5, 2),
  confidence DECIMAL(3, 2) CHECK (confidence >= 0 AND confidence <= 1),

  -- Action definition
  action JSONB,
  -- Example:
  -- {"type": "enable_cache", "params": {"ttl": 3600, "max_size": 1000}}
  -- {"type": "move_to_cold", "params": {"chunk_ids": [...], "target_tier": "cold"}}

  -- Implementation status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'applied', 'dismissed', 'expired', 'failed')),

  -- Workflow tracking
  dismissed_reason TEXT,
  dismissed_at TIMESTAMPTZ,

  applied_at TIMESTAMPTZ,
  applied_result JSONB,

  -- Auto-apply settings
  is_auto_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,

  -- Expiration
  expires_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_user
  ON cost_recommendations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_recommendations_pending
  ON cost_recommendations(user_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cost_recommendations_type
  ON cost_recommendations(user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_recommendations_collection
  ON cost_recommendations(collection_id, created_at DESC)
  WHERE collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_recommendations_high_impact
  ON cost_recommendations(user_id, impact, created_at DESC)
  WHERE status = 'pending' AND impact IN ('high', 'critical');

-- ===========================================
-- 5) RLS Policies
-- ===========================================
ALTER TABLE cost_chunk_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_query_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_cache_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_recommendations ENABLE ROW LEVEL SECURITY;

-- Chunk Access policies
CREATE POLICY "Users can view own cost_chunk_access"
  ON cost_chunk_access FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own cost_chunk_access"
  ON cost_chunk_access FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own cost_chunk_access"
  ON cost_chunk_access FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own cost_chunk_access"
  ON cost_chunk_access FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- Query Cache policies
CREATE POLICY "Users can view own cost_query_cache"
  ON cost_query_cache FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own cost_query_cache"
  ON cost_query_cache FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own cost_query_cache"
  ON cost_query_cache FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own cost_query_cache"
  ON cost_query_cache FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- Cache Metrics policies
CREATE POLICY "Users can view own cost_cache_metrics"
  ON cost_cache_metrics FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own cost_cache_metrics"
  ON cost_cache_metrics FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own cost_cache_metrics"
  ON cost_cache_metrics FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

-- Recommendations policies
CREATE POLICY "Users can view own cost_recommendations"
  ON cost_recommendations FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own cost_recommendations"
  ON cost_recommendations FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own cost_recommendations"
  ON cost_recommendations FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own cost_recommendations"
  ON cost_recommendations FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- ===========================================
-- 6) Helper Functions
-- ===========================================

-- Record chunk access (upsert)
CREATE OR REPLACE FUNCTION record_chunk_access(
  p_user_id TEXT,
  p_chunk_id TEXT,
  p_collection_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO cost_chunk_access (user_id, chunk_id, collection_id, access_count, last_accessed_at)
  VALUES (p_user_id, p_chunk_id, p_collection_id, 1, NOW())
  ON CONFLICT (user_id, chunk_id)
  DO UPDATE SET
    access_count = cost_chunk_access.access_count + 1,
    last_accessed_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Find similar cache entry by embedding
CREATE OR REPLACE FUNCTION find_similar_cache_entry(
  p_user_id TEXT,
  p_embedding vector(1024),
  p_index_version TEXT,
  p_policy_hash TEXT,
  p_similarity_threshold FLOAT DEFAULT 0.95
)
RETURNS TABLE (
  cache_key TEXT,
  result JSONB,
  similarity FLOAT,
  hit_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.cache_key,
    c.result,
    (1 - (c.embedding <=> p_embedding))::FLOAT AS similarity,
    c.hit_count
  FROM cost_query_cache c
  WHERE c.user_id = p_user_id
    AND c.index_version = p_index_version
    AND c.policy_hash = p_policy_hash
    AND c.embedding IS NOT NULL
    AND c.expires_at > NOW()
    AND (1 - (c.embedding <=> p_embedding)) >= p_similarity_threshold
  ORDER BY c.embedding <=> p_embedding
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cache size for user
CREATE OR REPLACE FUNCTION get_cache_size(p_user_id TEXT)
RETURNS TABLE (
  total_entries BIGINT,
  active_entries BIGINT,
  total_hits BIGINT,
  total_savings_usd DECIMAL(12, 6),
  avg_hit_rate FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_entries,
    COUNT(*) FILTER (WHERE expires_at > NOW())::BIGINT AS active_entries,
    SUM(hit_count)::BIGINT AS total_hits,
    SUM(cost_saved_usd)::DECIMAL(12, 6) AS total_savings_usd,
    CASE
      WHEN COUNT(*) > 0 THEN (SUM(hit_count)::FLOAT / GREATEST(COUNT(*), 1)::FLOAT)
      ELSE 0
    END AS avg_hit_rate
  FROM cost_query_cache
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record cache hit
CREATE OR REPLACE FUNCTION record_cache_hit(
  p_cache_key TEXT,
  p_latency_saved_ms INTEGER DEFAULT 0,
  p_tokens_saved INTEGER DEFAULT 0,
  p_cost_saved_usd DECIMAL(10, 6) DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  -- Update cache entry
  UPDATE cost_query_cache
  SET
    hit_count = hit_count + 1,
    last_hit_at = NOW(),
    latency_saved_ms = latency_saved_ms + p_latency_saved_ms,
    tokens_saved = tokens_saved + p_tokens_saved,
    cost_saved_usd = cost_saved_usd + p_cost_saved_usd,
    updated_at = NOW()
  WHERE cache_key = p_cache_key
  RETURNING user_id INTO v_user_id;

  -- Update user metrics
  IF v_user_id IS NOT NULL THEN
    INSERT INTO cost_cache_metrics (user_id, hit_count, total_latency_saved_ms, total_tokens_saved, total_cost_saved_usd)
    VALUES (v_user_id, 1, p_latency_saved_ms, p_tokens_saved, p_cost_saved_usd)
    ON CONFLICT (user_id)
    DO UPDATE SET
      hit_count = cost_cache_metrics.hit_count + 1,
      last_hour_hits = cost_cache_metrics.last_hour_hits + 1,
      total_latency_saved_ms = cost_cache_metrics.total_latency_saved_ms + p_latency_saved_ms,
      total_tokens_saved = cost_cache_metrics.total_tokens_saved + p_tokens_saved,
      total_cost_saved_usd = cost_cache_metrics.total_cost_saved_usd + p_cost_saved_usd,
      updated_at = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record cache miss
CREATE OR REPLACE FUNCTION record_cache_miss(p_user_id TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO cost_cache_metrics (user_id, miss_count, last_hour_misses)
  VALUES (p_user_id, 1, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET
    miss_count = cost_cache_metrics.miss_count + 1,
    last_hour_misses = cost_cache_metrics.last_hour_misses + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update chunk tier
CREATE OR REPLACE FUNCTION update_chunk_tier(
  p_user_id TEXT,
  p_chunk_id TEXT,
  p_new_tier TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_old_tier TEXT;
BEGIN
  SELECT current_tier INTO v_old_tier
  FROM cost_chunk_access
  WHERE user_id = p_user_id AND chunk_id = p_chunk_id;

  IF v_old_tier IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_old_tier = p_new_tier THEN
    RETURN TRUE;
  END IF;

  UPDATE cost_chunk_access
  SET
    current_tier = p_new_tier,
    previous_tier = v_old_tier,
    tier_changed_at = NOW()
  WHERE user_id = p_user_id AND chunk_id = p_chunk_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply a recommendation
CREATE OR REPLACE FUNCTION apply_cost_recommendation(
  p_recommendation_id UUID,
  p_user_id TEXT,
  p_result JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE cost_recommendations
  SET
    status = 'applied',
    applied_at = NOW(),
    applied_result = p_result
  WHERE id = p_recommendation_id
    AND user_id = p_user_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dismiss a recommendation
CREATE OR REPLACE FUNCTION dismiss_cost_recommendation(
  p_recommendation_id UUID,
  p_user_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE cost_recommendations
  SET
    status = 'dismissed',
    dismissed_at = NOW(),
    dismissed_reason = p_reason
  WHERE id = p_recommendation_id
    AND user_id = p_user_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cost optimization stats
CREATE OR REPLACE FUNCTION get_cost_optimization_stats(p_user_id TEXT)
RETURNS TABLE (
  cache_hit_rate FLOAT,
  cache_entries BIGINT,
  total_savings_usd DECIMAL(12, 6),
  hot_chunks BIGINT,
  warm_chunks BIGINT,
  cold_chunks BIGINT,
  pending_recommendations BIGINT,
  applied_recommendations BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Cache metrics
    CASE
      WHEN COALESCE(m.hit_count + m.miss_count, 0) > 0
      THEN (m.hit_count::FLOAT / GREATEST(m.hit_count + m.miss_count, 1)::FLOAT)
      ELSE 0
    END AS cache_hit_rate,
    (SELECT COUNT(*) FROM cost_query_cache WHERE user_id = p_user_id )::BIGINT AS cache_entries,
    COALESCE(m.total_cost_saved_usd, 0)::DECIMAL(12, 6) AS total_savings_usd,

    -- Chunk tiering
    (SELECT COUNT(*) FROM cost_chunk_access WHERE user_id = p_user_id AND current_tier = 'hot')::BIGINT AS hot_chunks,
    (SELECT COUNT(*) FROM cost_chunk_access WHERE user_id = p_user_id AND current_tier = 'warm')::BIGINT AS warm_chunks,
    (SELECT COUNT(*) FROM cost_chunk_access WHERE user_id = p_user_id AND current_tier IN ('cold', 'archive'))::BIGINT AS cold_chunks,

    -- Recommendations
    (SELECT COUNT(*) FROM cost_recommendations WHERE user_id = p_user_id AND status = 'pending')::BIGINT AS pending_recommendations,
    (SELECT COUNT(*) FROM cost_recommendations WHERE user_id = p_user_id AND status = 'applied')::BIGINT AS applied_recommendations

  FROM cost_cache_metrics m
  WHERE m.user_id = p_user_id;

  -- If no metrics exist, return zeros
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      0::FLOAT,
      (SELECT COUNT(*) FROM cost_query_cache WHERE user_id = p_user_id )::BIGINT,
      0::DECIMAL(12, 6),
      (SELECT COUNT(*) FROM cost_chunk_access WHERE user_id = p_user_id AND current_tier = 'hot')::BIGINT,
      (SELECT COUNT(*) FROM cost_chunk_access WHERE user_id = p_user_id AND current_tier = 'warm')::BIGINT,
      (SELECT COUNT(*) FROM cost_chunk_access WHERE user_id = p_user_id AND current_tier IN ('cold', 'archive'))::BIGINT,
      (SELECT COUNT(*) FROM cost_recommendations WHERE user_id = p_user_id AND status = 'pending')::BIGINT,
      (SELECT COUNT(*) FROM cost_recommendations WHERE user_id = p_user_id AND status = 'applied')::BIGINT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cost_cache(p_batch_size INTEGER DEFAULT 1000)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM cost_query_cache
    WHERE cache_key IN (
      SELECT cache_key
      FROM cost_query_cache
      WHERE expires_at < NOW()
      LIMIT p_batch_size
    )
    RETURNING cache_key
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Identify cold tier candidates
CREATE OR REPLACE FUNCTION identify_cold_tier_candidates(
  p_user_id TEXT,
  p_days_inactive INTEGER DEFAULT 7,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  chunk_id TEXT,
  collection_id UUID,
  access_count INTEGER,
  last_accessed_at TIMESTAMPTZ,
  days_inactive INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.chunk_id,
    c.collection_id,
    c.access_count,
    c.last_accessed_at,
    EXTRACT(DAY FROM NOW() - c.last_accessed_at)::INTEGER AS days_inactive
  FROM cost_chunk_access c
  WHERE c.user_id = p_user_id
    AND c.current_tier = 'hot'
    AND c.last_accessed_at < NOW() - (p_days_inactive || ' days')::INTERVAL
  ORDER BY c.last_accessed_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset hourly metrics (call via cron)
CREATE OR REPLACE FUNCTION reset_hourly_cache_metrics()
RETURNS VOID AS $$
BEGIN
  UPDATE cost_cache_metrics
  SET
    last_hour_hits = 0,
    last_hour_misses = 0,
    last_hour_reset_at = NOW()
  WHERE last_hour_reset_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 7) Triggers
-- ===========================================

-- Updated_at trigger for cost_query_cache
CREATE OR REPLACE FUNCTION update_cost_query_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cost_query_cache_updated ON cost_query_cache;
CREATE TRIGGER trigger_cost_query_cache_updated
  BEFORE UPDATE ON cost_query_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_cost_query_cache_updated_at();

-- Auto-set expires_at based on ttl
CREATE OR REPLACE FUNCTION set_cost_cache_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at = NEW.created_at + (NEW.ttl_seconds || ' seconds')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_cost_cache_expires ON cost_query_cache;
CREATE TRIGGER trigger_set_cost_cache_expires
  BEFORE INSERT ON cost_query_cache
  FOR EACH ROW
  EXECUTE FUNCTION set_cost_cache_expires_at();

-- ===========================================
-- 8) Views
-- ===========================================

-- Daily cost savings summary
CREATE OR REPLACE VIEW cost_savings_daily AS
SELECT
  user_id,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS cache_entries_created,
  SUM(hit_count) AS total_hits,
  SUM(latency_saved_ms) AS latency_saved_ms,
  SUM(tokens_saved) AS tokens_saved,
  SUM(cost_saved_usd) AS cost_saved_usd
FROM cost_query_cache
GROUP BY user_id, DATE_TRUNC('day', created_at);

GRANT SELECT ON cost_savings_daily TO authenticated;

-- Chunk tiering overview
CREATE OR REPLACE VIEW cost_tiering_overview AS
SELECT
  user_id,
  collection_id,
  current_tier,
  COUNT(*) AS chunk_count,
  SUM(access_count) AS total_accesses,
  MIN(last_accessed_at) AS oldest_access,
  MAX(last_accessed_at) AS newest_access
FROM cost_chunk_access
GROUP BY user_id, collection_id, current_tier;

GRANT SELECT ON cost_tiering_overview TO authenticated;

-- Pending recommendations by type
CREATE OR REPLACE VIEW cost_pending_recommendations AS
SELECT
  user_id,
  type,
  impact,
  COUNT(*) AS count,
  SUM(estimated_savings_usd) AS total_potential_savings
FROM cost_recommendations
WHERE status = 'pending'
GROUP BY user_id, type, impact;

GRANT SELECT ON cost_pending_recommendations TO authenticated;

-- ===========================================
-- 9) Comments
-- ===========================================
COMMENT ON TABLE cost_chunk_access IS 'Tracks chunk access patterns for intelligent tiering (hot/warm/cold)';
COMMENT ON TABLE cost_query_cache IS 'Semantic query cache for reducing redundant retrieval operations';
COMMENT ON TABLE cost_cache_metrics IS 'Aggregated cache hit/miss metrics per user';
COMMENT ON TABLE cost_recommendations IS 'AI-generated cost optimization recommendations';

COMMENT ON COLUMN cost_chunk_access.current_tier IS 'Current storage tier: hot (fast), warm (balanced), cold (archived)';
COMMENT ON COLUMN cost_query_cache.embedding IS 'Query embedding for semantic cache matching';
COMMENT ON COLUMN cost_query_cache.index_version IS 'Version of the search index when cache was created';
COMMENT ON COLUMN cost_query_cache.policy_hash IS 'Hash of retrieval policy for invalidation';

COMMENT ON FUNCTION find_similar_cache_entry IS 'Find semantically similar cached query results';
COMMENT ON FUNCTION get_cache_size IS 'Get cache statistics for a user';
COMMENT ON FUNCTION record_chunk_access IS 'Record a chunk access for tiering analysis';
COMMENT ON FUNCTION update_chunk_tier IS 'Update a chunk storage tier';
COMMENT ON FUNCTION get_cost_optimization_stats IS 'Get comprehensive cost optimization statistics';
COMMENT ON FUNCTION identify_cold_tier_candidates IS 'Identify chunks that should be moved to cold tier';
COMMENT ON FUNCTION cleanup_expired_cost_cache IS 'Remove expired cache entries in batches';
