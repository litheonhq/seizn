-- Memory router online-learning + scene->profile sync tracing
-- Adds:
-- 1) memory_router_strategy_stats: user/namespace/query-bucket strategy performance
-- 2) memory_scene_profile_sync_events: lifecycle consolidation profile-sync trace

-- =============================================================================
-- 1. Router strategy statistics
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_router_strategy_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',
  query_bucket TEXT NOT NULL DEFAULT 'medium',
  strategy TEXT NOT NULL CHECK (strategy IN ('slot', 'keyword', 'hybrid', 'vector')),

  total_queries INTEGER NOT NULL DEFAULT 0,
  total_successes INTEGER NOT NULL DEFAULT 0,
  total_zero_results INTEGER NOT NULL DEFAULT 0,

  avg_latency_ms NUMERIC(10,4) NOT NULL DEFAULT 0,
  avg_result_count NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_feedback_count INTEGER NOT NULL DEFAULT 0,
  avg_feedback_reward NUMERIC(6,4) NOT NULL DEFAULT 0,

  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, namespace, query_bucket, strategy)
);

CREATE INDEX IF NOT EXISTS idx_memory_router_stats_user_namespace
ON memory_router_strategy_stats(user_id, namespace);

CREATE INDEX IF NOT EXISTS idx_memory_router_stats_bucket
ON memory_router_strategy_stats(user_id, namespace, query_bucket);

CREATE INDEX IF NOT EXISTS idx_memory_router_stats_updated
ON memory_router_strategy_stats(updated_at DESC);

-- =============================================================================
-- 2. Scene profile sync trace events
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_scene_profile_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',
  scene_id UUID REFERENCES memory_clusters(id) ON DELETE SET NULL,
  scene_theme TEXT,

  update_field TEXT NOT NULL,
  slot_key TEXT,
  slot_value TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('applied', 'skipped', 'failed')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scene_profile_sync_user_namespace_created
ON memory_scene_profile_sync_events(user_id, namespace, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scene_profile_sync_scene
ON memory_scene_profile_sync_events(scene_id);

-- =============================================================================
-- 3. updated_at trigger for router strategy stats
-- =============================================================================

CREATE OR REPLACE FUNCTION set_memory_router_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memory_router_stats_updated_at
ON memory_router_strategy_stats;

CREATE TRIGGER trg_memory_router_stats_updated_at
BEFORE UPDATE ON memory_router_strategy_stats
FOR EACH ROW
EXECUTE FUNCTION set_memory_router_stats_updated_at();

-- =============================================================================
-- 4. RLS policies
-- =============================================================================

ALTER TABLE memory_router_strategy_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_scene_profile_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memory_router_stats_user_select ON memory_router_strategy_stats;
DROP POLICY IF EXISTS memory_router_stats_user_insert ON memory_router_strategy_stats;
DROP POLICY IF EXISTS memory_router_stats_user_update ON memory_router_strategy_stats;
DROP POLICY IF EXISTS memory_router_stats_user_delete ON memory_router_strategy_stats;
DROP POLICY IF EXISTS memory_router_stats_service_role ON memory_router_strategy_stats;

CREATE POLICY memory_router_stats_user_select
ON memory_router_strategy_stats FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY memory_router_stats_user_insert
ON memory_router_strategy_stats FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY memory_router_stats_user_update
ON memory_router_strategy_stats FOR UPDATE
USING (user_id = auth.uid()::text)
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY memory_router_stats_user_delete
ON memory_router_strategy_stats FOR DELETE
USING (user_id = auth.uid()::text);

CREATE POLICY memory_router_stats_service_role
ON memory_router_strategy_stats FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS memory_scene_profile_sync_user_select ON memory_scene_profile_sync_events;
DROP POLICY IF EXISTS memory_scene_profile_sync_user_insert ON memory_scene_profile_sync_events;
DROP POLICY IF EXISTS memory_scene_profile_sync_user_delete ON memory_scene_profile_sync_events;
DROP POLICY IF EXISTS memory_scene_profile_sync_service_role ON memory_scene_profile_sync_events;

CREATE POLICY memory_scene_profile_sync_user_select
ON memory_scene_profile_sync_events FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY memory_scene_profile_sync_user_insert
ON memory_scene_profile_sync_events FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY memory_scene_profile_sync_user_delete
ON memory_scene_profile_sync_events FOR DELETE
USING (user_id = auth.uid()::text);

CREATE POLICY memory_scene_profile_sync_service_role
ON memory_scene_profile_sync_events FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE memory_router_strategy_stats IS
  'Per-user online performance stats for automatic memory search strategy routing';

COMMENT ON TABLE memory_scene_profile_sync_events IS
  'Trace log for lifecycle scene profile updates that sync into slots/profile card';
