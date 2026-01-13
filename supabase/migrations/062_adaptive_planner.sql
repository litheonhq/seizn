-- ============================================
-- Migration: Adaptive Planner (#2) - Dynamic Query Planning
-- ============================================
-- Dynamically adjusts retrieval strategy based on query characteristics,
-- collection properties, and historical performance.

-- ============================================
-- Query Plans Table
-- ============================================

CREATE TABLE IF NOT EXISTS query_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID,

  -- Plan configuration
  plan_name TEXT NOT NULL,
  plan_config JSONB NOT NULL,  -- {topK, rerankTopN, hybridAlpha, filters...}

  -- Matching criteria
  query_patterns TEXT[],  -- Regex patterns this plan matches
  query_intents TEXT[],  -- Intent types (factual, exploratory, comparison, procedural, opinion)
  min_query_length INTEGER,
  max_query_length INTEGER,

  -- Performance metrics
  avg_latency_ms FLOAT DEFAULT 0,
  avg_relevance_score FLOAT DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  usage_count INTEGER DEFAULT 0,

  -- Learning
  is_learned BOOLEAN DEFAULT FALSE,
  learned_from_traces TEXT[],

  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique plan name per user per collection
  CONSTRAINT query_plans_user_collection_name_unique UNIQUE (user_id, collection_id, plan_name)
);

-- ============================================
-- Plan Selections Table
-- ============================================

CREATE TABLE IF NOT EXISTS plan_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID,
  plan_id UUID REFERENCES query_plans(id) ON DELETE SET NULL,

  -- Selection context
  query_text TEXT NOT NULL,
  detected_intent TEXT,
  query_features JSONB,  -- Length, entities, complexity, etc.

  -- Outcome
  latency_ms FLOAT,
  relevance_score FLOAT,
  user_satisfied BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Default Query Plans (System-wide)
-- ============================================

CREATE TABLE IF NOT EXISTS default_query_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT UNIQUE NOT NULL,
  description TEXT,
  plan_config JSONB NOT NULL,
  query_intents TEXT[],
  min_query_length INTEGER,
  max_query_length INTEGER,
  complexity TEXT CHECK (complexity IN ('simple', 'moderate', 'complex')),
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO default_query_plans (plan_name, description, plan_config, query_intents, min_query_length, max_query_length, complexity, priority)
VALUES
  -- Factual queries: precise, high threshold
  (
    'factual_simple',
    'Simple factual queries - quick, precise retrieval',
    '{"topK": 5, "rerankEnabled": false, "rerankTopN": 3, "hybridAlpha": 0.8, "threshold": 0.7, "mode": "hybrid"}'::jsonb,
    ARRAY['factual'],
    1,
    50,
    'simple',
    100
  ),
  -- Factual complex: needs more context
  (
    'factual_complex',
    'Complex factual queries - more context retrieval',
    '{"topK": 10, "rerankEnabled": true, "rerankTopN": 5, "hybridAlpha": 0.7, "threshold": 0.6, "mode": "hybrid"}'::jsonb,
    ARRAY['factual'],
    51,
    NULL,
    'complex',
    90
  ),
  -- Exploratory: broader retrieval
  (
    'exploratory',
    'Exploratory queries - broader context gathering',
    '{"topK": 15, "rerankEnabled": true, "rerankTopN": 8, "hybridAlpha": 0.6, "threshold": 0.5, "mode": "hybrid"}'::jsonb,
    ARRAY['exploratory'],
    NULL,
    NULL,
    NULL,
    80
  ),
  -- Comparison: multi-doc focus
  (
    'comparison',
    'Comparison queries - multi-document retrieval',
    '{"topK": 20, "rerankEnabled": true, "rerankTopN": 10, "hybridAlpha": 0.5, "threshold": 0.45, "mode": "hybrid"}'::jsonb,
    ARRAY['comparison'],
    NULL,
    NULL,
    NULL,
    80
  ),
  -- Procedural: step-by-step needs
  (
    'procedural',
    'Procedural queries - step-by-step instructions',
    '{"topK": 8, "rerankEnabled": true, "rerankTopN": 5, "hybridAlpha": 0.75, "threshold": 0.6, "mode": "hybrid"}'::jsonb,
    ARRAY['procedural'],
    NULL,
    NULL,
    NULL,
    75
  ),
  -- Opinion: diverse sources
  (
    'opinion',
    'Opinion queries - diverse perspective gathering',
    '{"topK": 12, "rerankEnabled": true, "rerankTopN": 6, "hybridAlpha": 0.5, "threshold": 0.5, "mode": "hybrid"}'::jsonb,
    ARRAY['opinion'],
    NULL,
    NULL,
    NULL,
    70
  ),
  -- Default fallback
  (
    'default',
    'Default plan for unclassified queries',
    '{"topK": 10, "rerankEnabled": true, "rerankTopN": 5, "hybridAlpha": 0.7, "threshold": 0.55, "mode": "hybrid"}'::jsonb,
    NULL,
    NULL,
    NULL,
    NULL,
    0
  )
ON CONFLICT (plan_name) DO NOTHING;

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_query_plans_user ON query_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_query_plans_collection ON query_plans(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_query_plans_active ON query_plans(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_query_plans_intents ON query_plans USING GIN (query_intents);
CREATE INDEX IF NOT EXISTS idx_query_plans_patterns ON query_plans USING GIN (query_patterns);
CREATE INDEX IF NOT EXISTS idx_query_plans_priority ON query_plans(priority DESC);

CREATE INDEX IF NOT EXISTS idx_plan_selections_plan ON plan_selections(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_selections_trace ON plan_selections(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plan_selections_created ON plan_selections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_selections_intent ON plan_selections(detected_intent);

CREATE INDEX IF NOT EXISTS idx_default_plans_intents ON default_query_plans USING GIN (query_intents);
CREATE INDEX IF NOT EXISTS idx_default_plans_active ON default_query_plans(is_active) WHERE is_active = TRUE;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE query_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_query_plans ENABLE ROW LEVEL SECURITY;

-- Users own their plans
CREATE POLICY "Users own their plans" ON query_plans
  FOR ALL USING (auth.uid() = user_id);

-- Plan selections accessible via owned plans
CREATE POLICY "Selections via plans" ON plan_selections
  FOR ALL USING (
    plan_id IS NULL OR
    EXISTS (SELECT 1 FROM query_plans WHERE id = plan_id AND user_id = auth.uid())
  );

-- Default plans are readable by everyone
CREATE POLICY "Default plans readable" ON default_query_plans
  FOR SELECT USING (TRUE);

-- Service role bypass for all tables
CREATE POLICY "Service role full access plans" ON query_plans
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access selections" ON plan_selections
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access default plans" ON default_query_plans
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================
-- Functions
-- ============================================

-- Update plan metrics after selection outcome
CREATE OR REPLACE FUNCTION update_plan_metrics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan_id IS NOT NULL AND NEW.latency_ms IS NOT NULL THEN
    UPDATE query_plans
    SET
      usage_count = usage_count + 1,
      avg_latency_ms = CASE
        WHEN usage_count > 0
        THEN (avg_latency_ms * usage_count + NEW.latency_ms) / (usage_count + 1)
        ELSE NEW.latency_ms
      END,
      avg_relevance_score = CASE
        WHEN NEW.relevance_score IS NOT NULL AND usage_count > 0
        THEN (avg_relevance_score * usage_count + NEW.relevance_score) / (usage_count + 1)
        WHEN NEW.relevance_score IS NOT NULL
        THEN NEW.relevance_score
        ELSE avg_relevance_score
      END,
      success_rate = CASE
        WHEN NEW.user_satisfied IS NOT NULL
        THEN (success_rate * usage_count + (CASE WHEN NEW.user_satisfied THEN 1.0 ELSE 0.0 END)) / (usage_count + 1)
        ELSE success_rate
      END,
      updated_at = NOW()
    WHERE id = NEW.plan_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for metrics update
DROP TRIGGER IF EXISTS trigger_update_plan_metrics ON plan_selections;
CREATE TRIGGER trigger_update_plan_metrics
  AFTER INSERT ON plan_selections
  FOR EACH ROW
  EXECUTE FUNCTION update_plan_metrics();

-- Find best matching plan for query
CREATE OR REPLACE FUNCTION find_matching_plan(
  p_user_id UUID,
  p_collection_id UUID,
  p_query_text TEXT,
  p_detected_intent TEXT,
  p_query_length INTEGER,
  p_complexity TEXT
)
RETURNS TABLE(
  plan_id UUID,
  plan_name TEXT,
  plan_config JSONB,
  match_score FLOAT,
  is_default BOOLEAN
) AS $$
DECLARE
  v_user_plan RECORD;
  v_default_plan RECORD;
  v_best_score FLOAT := 0;
  v_best_plan_id UUID;
  v_best_plan_name TEXT;
  v_best_plan_config JSONB;
  v_is_default BOOLEAN := FALSE;
BEGIN
  -- First, try user-specific plans
  FOR v_user_plan IN
    SELECT
      qp.id,
      qp.plan_name,
      qp.plan_config,
      qp.query_patterns,
      qp.query_intents,
      qp.min_query_length,
      qp.max_query_length,
      qp.priority,
      qp.success_rate
    FROM query_plans qp
    WHERE qp.user_id = p_user_id
      AND qp.is_active = TRUE
      AND (qp.collection_id IS NULL OR qp.collection_id = p_collection_id)
    ORDER BY qp.priority DESC, qp.success_rate DESC
  LOOP
    DECLARE
      v_score FLOAT := v_user_plan.priority::FLOAT / 100.0;
      v_pattern_match BOOLEAN := FALSE;
      v_intent_match BOOLEAN := FALSE;
      v_length_match BOOLEAN := TRUE;
    BEGIN
      -- Check pattern match
      IF v_user_plan.query_patterns IS NOT NULL AND array_length(v_user_plan.query_patterns, 1) > 0 THEN
        FOR i IN 1..array_length(v_user_plan.query_patterns, 1) LOOP
          IF p_query_text ~* v_user_plan.query_patterns[i] THEN
            v_pattern_match := TRUE;
            v_score := v_score + 0.3;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      -- Check intent match
      IF v_user_plan.query_intents IS NOT NULL AND p_detected_intent = ANY(v_user_plan.query_intents) THEN
        v_intent_match := TRUE;
        v_score := v_score + 0.4;
      END IF;

      -- Check length constraints
      IF v_user_plan.min_query_length IS NOT NULL AND p_query_length < v_user_plan.min_query_length THEN
        v_length_match := FALSE;
      END IF;
      IF v_user_plan.max_query_length IS NOT NULL AND p_query_length > v_user_plan.max_query_length THEN
        v_length_match := FALSE;
      END IF;

      IF v_length_match THEN
        v_score := v_score + 0.1;
      ELSE
        v_score := v_score - 0.5;
      END IF;

      -- Add success rate bonus
      IF v_user_plan.success_rate > 0.8 THEN
        v_score := v_score + 0.2;
      ELSIF v_user_plan.success_rate > 0.6 THEN
        v_score := v_score + 0.1;
      END IF;

      IF v_score > v_best_score THEN
        v_best_score := v_score;
        v_best_plan_id := v_user_plan.id;
        v_best_plan_name := v_user_plan.plan_name;
        v_best_plan_config := v_user_plan.plan_config;
        v_is_default := FALSE;
      END IF;
    END;
  END LOOP;

  -- If no good user plan found, try default plans
  IF v_best_score < 0.5 THEN
    FOR v_default_plan IN
      SELECT
        dp.id,
        dp.plan_name,
        dp.plan_config,
        dp.query_intents,
        dp.min_query_length,
        dp.max_query_length,
        dp.complexity,
        dp.priority
      FROM default_query_plans dp
      WHERE dp.is_active = TRUE
      ORDER BY dp.priority DESC
    LOOP
      DECLARE
        v_score FLOAT := v_default_plan.priority::FLOAT / 100.0;
        v_intent_match BOOLEAN := FALSE;
        v_length_match BOOLEAN := TRUE;
        v_complexity_match BOOLEAN := FALSE;
      BEGIN
        -- Check intent match
        IF v_default_plan.query_intents IS NOT NULL AND p_detected_intent = ANY(v_default_plan.query_intents) THEN
          v_intent_match := TRUE;
          v_score := v_score + 0.5;
        END IF;

        -- Check length constraints
        IF v_default_plan.min_query_length IS NOT NULL AND p_query_length < v_default_plan.min_query_length THEN
          v_length_match := FALSE;
        END IF;
        IF v_default_plan.max_query_length IS NOT NULL AND p_query_length > v_default_plan.max_query_length THEN
          v_length_match := FALSE;
        END IF;

        IF v_length_match THEN
          v_score := v_score + 0.1;
        ELSE
          v_score := v_score - 0.3;
        END IF;

        -- Check complexity match
        IF v_default_plan.complexity IS NOT NULL AND v_default_plan.complexity = p_complexity THEN
          v_complexity_match := TRUE;
          v_score := v_score + 0.2;
        END IF;

        IF v_score > v_best_score THEN
          v_best_score := v_score;
          v_best_plan_id := v_default_plan.id;
          v_best_plan_name := v_default_plan.plan_name;
          v_best_plan_config := v_default_plan.plan_config;
          v_is_default := TRUE;
        END IF;
      END;
    END LOOP;
  END IF;

  -- Return best match or default fallback
  IF v_best_plan_id IS NOT NULL THEN
    RETURN QUERY SELECT v_best_plan_id, v_best_plan_name, v_best_plan_config, v_best_score, v_is_default;
  ELSE
    -- Return the default fallback plan
    RETURN QUERY
    SELECT dp.id, dp.plan_name, dp.plan_config, 0.0::FLOAT, TRUE
    FROM default_query_plans dp
    WHERE dp.plan_name = 'default'
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get plan performance summary
CREATE OR REPLACE FUNCTION get_plan_performance_summary(
  p_user_id UUID,
  p_collection_id UUID DEFAULT NULL,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  plan_id UUID,
  plan_name TEXT,
  total_uses INTEGER,
  avg_latency_ms FLOAT,
  avg_relevance FLOAT,
  success_rate FLOAT,
  intent_distribution JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qp.id AS plan_id,
    qp.plan_name,
    qp.usage_count AS total_uses,
    qp.avg_latency_ms,
    qp.avg_relevance_score AS avg_relevance,
    qp.success_rate,
    (
      SELECT jsonb_object_agg(ps.detected_intent, cnt)
      FROM (
        SELECT detected_intent, COUNT(*) AS cnt
        FROM plan_selections
        WHERE plan_id = qp.id
          AND created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY detected_intent
      ) ps
    ) AS intent_distribution
  FROM query_plans qp
  WHERE qp.user_id = p_user_id
    AND (p_collection_id IS NULL OR qp.collection_id = p_collection_id)
    AND qp.is_active = TRUE
  ORDER BY qp.usage_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Learn new plan from high-performing selections
CREATE OR REPLACE FUNCTION learn_plan_from_selections(
  p_user_id UUID,
  p_collection_id UUID,
  p_min_samples INTEGER DEFAULT 10,
  p_min_success_rate FLOAT DEFAULT 0.8
)
RETURNS TABLE(
  success BOOLEAN,
  plan_id UUID,
  plan_name TEXT,
  samples_used INTEGER
) AS $$
DECLARE
  v_best_config JSONB;
  v_plan_name TEXT;
  v_samples INTEGER;
  v_new_plan_id UUID;
  v_intent TEXT;
BEGIN
  -- Find successful selections without a plan (default plan used)
  WITH successful_selections AS (
    SELECT
      ps.query_features,
      ps.detected_intent,
      ps.latency_ms,
      ps.relevance_score
    FROM plan_selections ps
    WHERE ps.plan_id IS NULL
      AND ps.user_satisfied = TRUE
      AND ps.relevance_score >= 0.7
      AND ps.created_at >= NOW() - INTERVAL '30 days'
  ),
  intent_stats AS (
    SELECT
      detected_intent,
      COUNT(*) AS cnt,
      AVG(latency_ms) AS avg_lat,
      AVG(relevance_score) AS avg_rel
    FROM successful_selections
    GROUP BY detected_intent
    HAVING COUNT(*) >= p_min_samples
    ORDER BY COUNT(*) DESC
    LIMIT 1
  )
  SELECT detected_intent, cnt INTO v_intent, v_samples
  FROM intent_stats;

  IF v_intent IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0;
    RETURN;
  END IF;

  -- Generate plan name
  v_plan_name := 'learned_' || v_intent || '_' || to_char(NOW(), 'YYYYMMDD');

  -- Get best config from default plan for this intent
  SELECT dp.plan_config INTO v_best_config
  FROM default_query_plans dp
  WHERE dp.query_intents IS NOT NULL AND v_intent = ANY(dp.query_intents)
  ORDER BY dp.priority DESC
  LIMIT 1;

  IF v_best_config IS NULL THEN
    SELECT dp.plan_config INTO v_best_config
    FROM default_query_plans dp
    WHERE dp.plan_name = 'default';
  END IF;

  -- Create new learned plan
  INSERT INTO query_plans (
    user_id,
    collection_id,
    plan_name,
    plan_config,
    query_intents,
    is_learned,
    priority
  )
  VALUES (
    p_user_id,
    p_collection_id,
    v_plan_name,
    v_best_config,
    ARRAY[v_intent],
    TRUE,
    50
  )
  ON CONFLICT (user_id, collection_id, plan_name) DO NOTHING
  RETURNING id INTO v_new_plan_id;

  IF v_new_plan_id IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, v_new_plan_id, v_plan_name, v_samples;
  ELSE
    RETURN QUERY SELECT FALSE, NULL::UUID, v_plan_name, 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_query_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_query_plans_updated_at ON query_plans;
CREATE TRIGGER trigger_query_plans_updated_at
  BEFORE UPDATE ON query_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_query_plans_updated_at();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE query_plans IS 'User-specific query plans for adaptive retrieval';
COMMENT ON TABLE plan_selections IS 'History of plan selections and their outcomes';
COMMENT ON TABLE default_query_plans IS 'System-wide default plans for different query types';
COMMENT ON COLUMN query_plans.plan_config IS 'JSON config with topK, rerankTopN, hybridAlpha, threshold, mode, etc.';
COMMENT ON COLUMN query_plans.query_intents IS 'Intent types: factual, exploratory, comparison, procedural, opinion';
COMMENT ON COLUMN query_plans.is_learned IS 'Whether this plan was auto-generated from successful selections';
COMMENT ON FUNCTION find_matching_plan IS 'Find best plan for a query based on intent, patterns, and constraints';
COMMENT ON FUNCTION learn_plan_from_selections IS 'Auto-generate plans from high-performing selections';
