-- Migration: 20260302002_semantic_cache_experiment_events.sql
-- Description: Track semantic cache A/B experiment outcomes for v0/v1 memory search.

CREATE TABLE IF NOT EXISTS memory_semantic_cache_experiment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',
  source TEXT NOT NULL CHECK (source IN ('v0', 'v1')),
  requested_mode TEXT NOT NULL,
  resolved_mode TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('control', 'treatment')),
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER NOT NULL DEFAULT 0,
  fallback_reason TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_semantic_cache_events_user_namespace_created
ON memory_semantic_cache_experiment_events(user_id, namespace, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_cache_events_variant_source_created
ON memory_semantic_cache_experiment_events(variant, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_cache_events_created
ON memory_semantic_cache_experiment_events(created_at DESC);

ALTER TABLE memory_semantic_cache_experiment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS semantic_cache_events_user_select ON memory_semantic_cache_experiment_events;
DROP POLICY IF EXISTS semantic_cache_events_user_insert ON memory_semantic_cache_experiment_events;
DROP POLICY IF EXISTS semantic_cache_events_user_delete ON memory_semantic_cache_experiment_events;
DROP POLICY IF EXISTS semantic_cache_events_service_role ON memory_semantic_cache_experiment_events;

CREATE POLICY semantic_cache_events_user_select
ON memory_semantic_cache_experiment_events FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY semantic_cache_events_user_insert
ON memory_semantic_cache_experiment_events FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY semantic_cache_events_user_delete
ON memory_semantic_cache_experiment_events FOR DELETE
USING (user_id = auth.uid()::text);

CREATE POLICY semantic_cache_events_service_role
ON memory_semantic_cache_experiment_events FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE memory_semantic_cache_experiment_events IS
  'A/B experiment events for semantic query-result cache by mode/variant/source';

NOTIFY pgrst, 'reload schema';