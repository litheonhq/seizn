-- Beyond Mem0: Memory Tier Architecture
-- Implements MemGPT-style tiered memory management

-- ============================================================
-- Add tier columns to spring_memory_notes
-- ============================================================

ALTER TABLE spring_memory_notes
  ADD COLUMN IF NOT EXISTS memory_tier VARCHAR(10)
    DEFAULT 'warm'
    CHECK (memory_tier IN ('hot', 'warm', 'cold', 'frozen')),
  ADD COLUMN IF NOT EXISTS tier_assigned_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS tier_reason TEXT,
  ADD COLUMN IF NOT EXISTS tier_score FLOAT;

-- ============================================================
-- Tier-related indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_memory_notes_tier
ON spring_memory_notes (user_id, memory_tier, created_at DESC)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_memory_notes_tier_score
ON spring_memory_notes (user_id, tier_score DESC)
WHERE status = 'active' AND tier_score IS NOT NULL;

-- Composite index for tier-aware context packing
CREATE INDEX IF NOT EXISTS idx_memory_notes_tier_packing
ON spring_memory_notes (user_id, memory_tier, salience DESC)
WHERE status = 'active';

-- ============================================================
-- Tier transition history
-- ============================================================

CREATE TABLE IF NOT EXISTS spring_memory_tier_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES spring_memory_notes(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  previous_tier VARCHAR(10),
  new_tier VARCHAR(10) NOT NULL,
  reason TEXT,
  triggered_by VARCHAR(50), -- 'system_rebalance', 'usage_promotion', 'time_demotion', 'manual'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tier_history_memory
ON spring_memory_tier_history (memory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tier_history_user
ON spring_memory_tier_history (user_id, created_at DESC);

-- ============================================================
-- Tier configuration per user/organization
-- ============================================================

CREATE TABLE IF NOT EXISTS spring_tier_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Tier thresholds (salience-based)
  hot_min_salience FLOAT DEFAULT 0.8,
  warm_min_salience FLOAT DEFAULT 0.4,
  cold_min_salience FLOAT DEFAULT 0.1,

  -- Time-based demotion (days)
  hot_max_age_days INT DEFAULT 7,
  warm_max_age_days INT DEFAULT 30,

  -- Usage-based promotion thresholds
  promotion_access_count INT DEFAULT 5,
  promotion_time_window_hours INT DEFAULT 168, -- 7 days

  -- Budget allocation (percentage)
  hot_budget_pct FLOAT DEFAULT 30.0,
  warm_budget_pct FLOAT DEFAULT 50.0,
  cold_budget_pct FLOAT DEFAULT 20.0,

  -- Type-specific tier rules (JSON)
  type_rules JSONB DEFAULT '{
    "preference": {"default_tier": "hot", "prevent_demotion": true},
    "instruction": {"default_tier": "hot", "prevent_demotion": true},
    "fact": {"default_tier": "warm"},
    "episode": {"default_tier": "warm", "auto_archive_days": 14},
    "relationship": {"default_tier": "warm"},
    "procedure": {"default_tier": "warm"}
  }'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT tier_config_owner_check CHECK (
    (user_id IS NOT NULL AND organization_id IS NULL) OR
    (user_id IS NULL AND organization_id IS NOT NULL)
  ),
  CONSTRAINT tier_budget_check CHECK (
    hot_budget_pct + warm_budget_pct + cold_budget_pct <= 100.0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tier_config_user
ON spring_tier_config (user_id)
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tier_config_org
ON spring_tier_config (organization_id)
WHERE organization_id IS NOT NULL;

-- ============================================================
-- Trigger to track tier changes
-- ============================================================

CREATE OR REPLACE FUNCTION track_tier_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.memory_tier IS DISTINCT FROM NEW.memory_tier THEN
    INSERT INTO spring_memory_tier_history (
      memory_id,
      user_id,
      previous_tier,
      new_tier,
      reason,
      triggered_by
    ) VALUES (
      NEW.id,
      NEW.user_id,
      OLD.memory_tier,
      NEW.memory_tier,
      NEW.tier_reason,
      COALESCE(current_setting('app.tier_trigger', true), 'unknown')
    );

    NEW.tier_assigned_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_track_tier_change ON spring_memory_notes;
CREATE TRIGGER trg_track_tier_change
BEFORE UPDATE OF memory_tier ON spring_memory_notes
FOR EACH ROW EXECUTE FUNCTION track_tier_change();

-- ============================================================
-- Function: Calculate tier score
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_tier_score(
  p_salience FLOAT,
  p_access_count BIGINT,
  p_last_accessed TIMESTAMPTZ,
  p_created_at TIMESTAMPTZ
) RETURNS FLOAT AS $$
DECLARE
  recency_factor FLOAT;
  access_factor FLOAT;
  age_days FLOAT;
BEGIN
  -- Calculate age in days
  age_days := EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 86400.0;

  -- Recency factor (exponential decay, half-life of 7 days)
  IF p_last_accessed IS NOT NULL THEN
    recency_factor := EXP(-0.099 * EXTRACT(EPOCH FROM (NOW() - p_last_accessed)) / 86400.0);
  ELSE
    recency_factor := EXP(-0.099 * age_days);
  END IF;

  -- Access factor (logarithmic, normalized)
  access_factor := LN(GREATEST(1, p_access_count) + 1) / 5.0;
  access_factor := LEAST(1.0, access_factor);

  -- Combined score: salience * (recency * 0.4 + access * 0.3 + base 0.3)
  RETURN COALESCE(p_salience, 0.5) * (
    recency_factor * 0.4 +
    access_factor * 0.3 +
    0.3
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Function: Determine optimal tier for a memory
-- ============================================================

CREATE OR REPLACE FUNCTION determine_memory_tier(
  p_user_id TEXT,
  p_memory_id UUID
) RETURNS VARCHAR(10) AS $$
DECLARE
  v_note RECORD;
  v_config RECORD;
  v_tier_score FLOAT;
  v_type_rule JSONB;
BEGIN
  -- Get note details (using v3 column names)
  SELECT
    n.*,
    COALESCE(
      (SELECT COUNT(*) FROM spring_memory_usage_events WHERE memory_id = n.id),
      0
    ) as access_count,
    (SELECT MAX(used_at) FROM spring_memory_usage_events WHERE memory_id = n.id) as last_accessed
  INTO v_note
  FROM spring_memory_notes n
  WHERE n.id = p_memory_id AND n.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'warm';
  END IF;

  -- Get user's tier config (or defaults)
  SELECT * INTO v_config
  FROM spring_tier_config
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- Use defaults
    v_config := ROW(
      NULL, p_user_id, NULL,
      0.8, 0.4, 0.1,
      7, 30,
      5, 168,
      30.0, 50.0, 20.0,
      '{"preference": {"default_tier": "hot"}}'::jsonb,
      NOW(), NOW()
    );
  END IF;

  -- Check type-specific rules
  v_type_rule := v_config.type_rules -> v_note.note_type;
  IF v_type_rule IS NOT NULL AND v_type_rule->>'default_tier' IS NOT NULL THEN
    -- If prevent_demotion is true, keep at default tier or higher
    IF (v_type_rule->>'prevent_demotion')::boolean = true THEN
      RETURN v_type_rule->>'default_tier';
    END IF;
  END IF;

  -- Calculate tier score
  v_tier_score := calculate_tier_score(
    v_note.salience,
    v_note.access_count,
    v_note.last_accessed,
    v_note.created_at
  );

  -- Determine tier based on score
  IF v_tier_score >= v_config.hot_min_salience THEN
    RETURN 'hot';
  ELSIF v_tier_score >= v_config.warm_min_salience THEN
    RETURN 'warm';
  ELSIF v_tier_score >= v_config.cold_min_salience THEN
    RETURN 'cold';
  ELSE
    RETURN 'frozen';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Rebalance tiers for a user
-- ============================================================

CREATE OR REPLACE FUNCTION rebalance_user_tiers(
  p_user_id TEXT,
  p_batch_size INT DEFAULT 500
) RETURNS TABLE (
  promoted INT,
  demoted INT,
  unchanged INT
) AS $$
DECLARE
  v_promoted INT := 0;
  v_demoted INT := 0;
  v_unchanged INT := 0;
  v_memory RECORD;
  v_new_tier VARCHAR(10);
BEGIN
  -- Set trigger context
  PERFORM set_config('app.tier_trigger', 'system_rebalance', true);

  FOR v_memory IN
    SELECT id, memory_tier
    FROM spring_memory_notes
    WHERE user_id = p_user_id
      AND status = 'active'
    ORDER BY updated_at DESC
    LIMIT p_batch_size
  LOOP
    v_new_tier := determine_memory_tier(p_user_id, v_memory.id);

    IF v_new_tier != v_memory.memory_tier THEN
      UPDATE spring_memory_notes
      SET
        memory_tier = v_new_tier,
        tier_score = calculate_tier_score(salience, 0, NULL, created_at),
        tier_reason = 'Automatic rebalance'
      WHERE id = v_memory.id;

      IF v_new_tier IN ('hot', 'warm') AND v_memory.memory_tier IN ('cold', 'frozen') THEN
        v_promoted := v_promoted + 1;
      ELSIF v_new_tier IN ('cold', 'frozen') AND v_memory.memory_tier IN ('hot', 'warm') THEN
        v_demoted := v_demoted + 1;
      ELSE
        v_unchanged := v_unchanged + 1;
      END IF;
    ELSE
      v_unchanged := v_unchanged + 1;
    END IF;
  END LOOP;

  promoted := v_promoted;
  demoted := v_demoted;
  unchanged := v_unchanged;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: Get memories by tier with budget
-- ============================================================

CREATE OR REPLACE FUNCTION get_memories_by_tier_budget(
  p_user_id TEXT,
  p_total_budget INT,
  p_hot_pct FLOAT DEFAULT 40.0,
  p_warm_pct FLOAT DEFAULT 40.0,
  p_cold_pct FLOAT DEFAULT 20.0
) RETURNS TABLE (
  memory_id UUID,
  content TEXT,
  note_type VARCHAR,
  memory_tier VARCHAR,
  salience FLOAT,
  estimated_tokens INT
) AS $$
DECLARE
  v_hot_budget INT;
  v_warm_budget INT;
  v_cold_budget INT;
BEGIN
  -- Calculate tier budgets
  v_hot_budget := (p_total_budget * p_hot_pct / 100.0)::INT;
  v_warm_budget := (p_total_budget * p_warm_pct / 100.0)::INT;
  v_cold_budget := (p_total_budget * p_cold_pct / 100.0)::INT;

  RETURN QUERY
  WITH hot_memories AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.memory_tier,
      n.salience,
      (LENGTH(n.content) / 4)::INT as est_tokens,
      SUM((LENGTH(n.content) / 4)::INT) OVER (ORDER BY n.salience DESC) as running_total
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.memory_tier = 'hot'
    ORDER BY n.salience DESC
  ),
  warm_memories AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.memory_tier,
      n.salience,
      (LENGTH(n.content) / 4)::INT as est_tokens,
      SUM((LENGTH(n.content) / 4)::INT) OVER (ORDER BY n.salience DESC) as running_total
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.memory_tier = 'warm'
    ORDER BY n.salience DESC
  ),
  cold_memories AS (
    SELECT
      n.id,
      n.content,
      n.note_type,
      n.memory_tier,
      n.salience,
      (LENGTH(n.content) / 4)::INT as est_tokens,
      SUM((LENGTH(n.content) / 4)::INT) OVER (ORDER BY n.salience DESC) as running_total
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND n.memory_tier = 'cold'
    ORDER BY n.salience DESC
  )
  SELECT h.id, h.content, h.note_type, h.memory_tier, h.salience, h.est_tokens
  FROM hot_memories h
  WHERE h.running_total <= v_hot_budget
  UNION ALL
  SELECT w.id, w.content, w.note_type, w.memory_tier, w.salience, w.est_tokens
  FROM warm_memories w
  WHERE w.running_total <= v_warm_budget
  UNION ALL
  SELECT c.id, c.content, c.note_type, c.memory_tier, c.salience, c.est_tokens
  FROM cold_memories c
  WHERE c.running_total <= v_cold_budget;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS Policies for new tables
-- ============================================================

ALTER TABLE spring_memory_tier_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_tier_config ENABLE ROW LEVEL SECURITY;

-- Tier history: users can view their own
CREATE POLICY tier_history_select ON spring_memory_tier_history
  FOR SELECT USING (auth.uid()::text = user_id);

-- Tier config: users can manage their own
CREATE POLICY tier_config_all ON spring_tier_config
  FOR ALL USING (auth.uid()::text = user_id);

-- ============================================================
-- Initialize existing memories with default tier
-- ============================================================

-- Set warm as default for existing memories without tier
UPDATE spring_memory_notes
SET
  memory_tier = 'warm',
  tier_assigned_at = NOW(),
  tier_reason = 'Initial migration'
WHERE memory_tier IS NULL;

-- Set hot tier for preferences and instructions
UPDATE spring_memory_notes
SET
  memory_tier = 'hot',
  tier_assigned_at = NOW(),
  tier_reason = 'Type-based: preferences/instructions default to hot'
WHERE note_type IN ('preference', 'instruction')
  AND memory_tier = 'warm';

COMMENT ON TABLE spring_memory_tier_history IS 'Tracks memory tier transitions for debugging and analytics';
COMMENT ON TABLE spring_tier_config IS 'Per-user/org configuration for memory tier management';
COMMENT ON COLUMN spring_memory_notes.memory_tier IS 'MemGPT-style tier: hot (always loaded), warm (frequently used), cold (archived), frozen (rarely accessed)';
