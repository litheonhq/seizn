-- Advanced Memory Features Migration
-- Adds support for:
--   - Smart Decay (Ebbinghaus forgetting curve)
--   - Q-Value scoring (MemRL pattern)
--   - Memory as a Service (MaaS) namespaces & operations log

-- ============================================
-- 1. New columns on memories table
-- ============================================

-- Smart Decay columns
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS stability FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- Q-Value utility score
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS utility_score FLOAT DEFAULT 0.5;

-- Index for decay queries (stability-based)
CREATE INDEX IF NOT EXISTS idx_memories_stability
ON memories(user_id, stability)
WHERE is_deleted = false;

-- Index for Q-value retrieval
CREATE INDEX IF NOT EXISTS idx_memories_utility
ON memories(user_id, utility_score DESC)
WHERE is_deleted = false;

-- ============================================
-- 2. memory_namespaces table (MaaS)
-- ============================================

CREATE TABLE IF NOT EXISTS memory_namespaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'private'
    CHECK (scope IN ('private', 'shared', 'public')),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  channels TEXT[] DEFAULT ARRAY['episodic', 'semantic'],
  retention_policy JSONB DEFAULT '{
    "maxMemories": 0,
    "maxAgeDays": 0,
    "archiveThreshold": 2,
    "deleteThreshold": 1,
    "consolidationIntervalHours": 0
  }'::jsonb,
  acl JSONB DEFAULT '[]'::jsonb,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_namespaces_owner
ON memory_namespaces(owner_id);

CREATE INDEX IF NOT EXISTS idx_memory_namespaces_org
ON memory_namespaces(organization_id)
WHERE organization_id IS NOT NULL;

-- RLS for memory_namespaces
ALTER TABLE memory_namespaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own namespaces"
ON memory_namespaces FOR SELECT
USING (
  owner_id = auth.uid()
  OR scope = 'public'
  OR (scope = 'shared' AND organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "Users can create own namespaces"
ON memory_namespaces FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update namespaces"
ON memory_namespaces FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete namespaces"
ON memory_namespaces FOR DELETE
USING (owner_id = auth.uid());

-- Service role bypass
CREATE POLICY "Service role full access to namespaces"
ON memory_namespaces FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- 3. memory_operations_log table (MaaS audit)
-- ============================================

CREATE TABLE IF NOT EXISTS memory_operations_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id TEXT NOT NULL,
  namespace_id TEXT REFERENCES memory_namespaces(id) ON DELETE SET NULL,
  channel TEXT,
  operation_type TEXT NOT NULL
    CHECK (operation_type IN ('store', 'search', 'update', 'delete', 'consolidate')),
  operator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  success BOOLEAN DEFAULT false,
  latency_ms INTEGER DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_ops_namespace
ON memory_operations_log(namespace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_ops_operator
ON memory_operations_log(operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_ops_type
ON memory_operations_log(operation_type, created_at DESC);

-- RLS for memory_operations_log
ALTER TABLE memory_operations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operations"
ON memory_operations_log FOR SELECT
USING (operator_id = auth.uid());

CREATE POLICY "Users can insert own operations"
ON memory_operations_log FOR INSERT
WITH CHECK (operator_id = auth.uid());

CREATE POLICY "Service role full access to operations"
ON memory_operations_log FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- 4. Helper functions
-- ============================================

-- Update memory stability after review (Ebbinghaus model)
CREATE OR REPLACE FUNCTION record_memory_review(
  p_memory_id UUID,
  p_stability_multiplier FLOAT DEFAULT 1.5
)
RETURNS VOID AS $$
BEGIN
  UPDATE memories
  SET
    stability = LEAST(stability * p_stability_multiplier, 365.0),
    review_count = COALESCE(review_count, 0) + 1,
    access_count = COALESCE(access_count, 0) + 1,
    last_accessed_at = NOW()
  WHERE id = p_memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Batch update Q-values (for MemRL scoring)
CREATE OR REPLACE FUNCTION batch_update_q_values(
  p_updates JSONB  -- Array of {id: uuid, utility_score: float}
)
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER := 0;
  item JSONB;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE memories
    SET utility_score = (item->>'utility_score')::FLOAT
    WHERE id = (item->>'id')::UUID;

    IF FOUND THEN affected := affected + 1; END IF;
  END LOOP;

  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
