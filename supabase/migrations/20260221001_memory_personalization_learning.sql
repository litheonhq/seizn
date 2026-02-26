-- Memory Personalization Learning (user-adaptive memory ranking)
-- Adds:
-- 1) user_memory_learning_profiles: per-user/per-namespace personalization state
-- 2) memory_feedback_events: explicit/implicit feedback history

-- =============================================================================
-- 1. Personalization profile table
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_memory_learning_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',

  personalization_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Dynamic weights learned from feedback
  memory_type_weights JSONB NOT NULL DEFAULT '{
    "fact": 1.0,
    "preference": 1.0,
    "experience": 1.0,
    "relationship": 1.0,
    "instruction": 1.0
  }'::jsonb,
  tag_weights JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Score blend controls
  recency_weight NUMERIC(5,4) NOT NULL DEFAULT 0.2000,
  importance_weight NUMERIC(5,4) NOT NULL DEFAULT 0.2000,
  similarity_weight NUMERIC(5,4) NOT NULL DEFAULT 0.6000,

  -- Learning stats
  total_feedback_count INTEGER NOT NULL DEFAULT 0,
  positive_feedback_count INTEGER NOT NULL DEFAULT 0,
  negative_feedback_count INTEGER NOT NULL DEFAULT 0,
  last_feedback_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, namespace)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_learning_profiles_user_namespace
ON user_memory_learning_profiles(user_id, namespace);

CREATE INDEX IF NOT EXISTS idx_user_memory_learning_profiles_enabled
ON user_memory_learning_profiles(user_id, personalization_enabled);

-- =============================================================================
-- 2. Feedback event table
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL CHECK (
    event_type IN ('thumbs_up', 'thumbs_down', 'click', 'open', 'reuse')
  ),
  query_text TEXT,
  memory_type TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  reward NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_feedback_events_user_namespace_created
ON memory_feedback_events(user_id, namespace, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_feedback_events_memory_created
ON memory_feedback_events(memory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_feedback_events_event_type
ON memory_feedback_events(user_id, event_type, created_at DESC);

-- =============================================================================
-- 3. Updated_at trigger for profile table
-- =============================================================================

CREATE OR REPLACE FUNCTION set_learning_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_memory_learning_profiles_updated_at
ON user_memory_learning_profiles;

CREATE TRIGGER trg_user_memory_learning_profiles_updated_at
BEFORE UPDATE ON user_memory_learning_profiles
FOR EACH ROW
EXECUTE FUNCTION set_learning_profile_updated_at();

-- =============================================================================
-- 4. RLS policies
-- =============================================================================

ALTER TABLE user_memory_learning_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_feedback_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_memory_learning_profiles_user_select ON user_memory_learning_profiles;
DROP POLICY IF EXISTS user_memory_learning_profiles_user_insert ON user_memory_learning_profiles;
DROP POLICY IF EXISTS user_memory_learning_profiles_user_update ON user_memory_learning_profiles;
DROP POLICY IF EXISTS user_memory_learning_profiles_user_delete ON user_memory_learning_profiles;
DROP POLICY IF EXISTS user_memory_learning_profiles_service_role ON user_memory_learning_profiles;

CREATE POLICY user_memory_learning_profiles_user_select
ON user_memory_learning_profiles FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY user_memory_learning_profiles_user_insert
ON user_memory_learning_profiles FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY user_memory_learning_profiles_user_update
ON user_memory_learning_profiles FOR UPDATE
USING (user_id = auth.uid()::text)
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY user_memory_learning_profiles_user_delete
ON user_memory_learning_profiles FOR DELETE
USING (user_id = auth.uid()::text);

CREATE POLICY user_memory_learning_profiles_service_role
ON user_memory_learning_profiles FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS memory_feedback_events_user_select ON memory_feedback_events;
DROP POLICY IF EXISTS memory_feedback_events_user_insert ON memory_feedback_events;
DROP POLICY IF EXISTS memory_feedback_events_user_delete ON memory_feedback_events;
DROP POLICY IF EXISTS memory_feedback_events_service_role ON memory_feedback_events;

CREATE POLICY memory_feedback_events_user_select
ON memory_feedback_events FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY memory_feedback_events_user_insert
ON memory_feedback_events FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY memory_feedback_events_user_delete
ON memory_feedback_events FOR DELETE
USING (user_id = auth.uid()::text);

CREATE POLICY memory_feedback_events_service_role
ON memory_feedback_events FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE user_memory_learning_profiles IS
  'Per-user memory personalization state and learned scoring preferences';

COMMENT ON TABLE memory_feedback_events IS
  'Explicit/implicit feedback signals used for online memory ranking adaptation';
