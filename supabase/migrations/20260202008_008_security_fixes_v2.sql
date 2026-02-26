-- Migration: 20260202_008_security_fixes_v2.sql
-- Description: Additional security fixes for SECURITY DEFINER functions
-- - Adds SET search_path = public to all SECURITY DEFINER functions
-- - Re-fixes dlq_statistics view to remove SECURITY DEFINER
-- Based on Supabase Security Advisor reports (files 7 & 8)
-- Created: 2026-02-02

-- #############################################
-- PART 1: Re-fix dlq_statistics view
-- #############################################

-- Drop and recreate without SECURITY DEFINER
-- Uses healing_dlq table (correct table name from 20260202_001_dlq.sql)
DROP VIEW IF EXISTS public.dlq_statistics;

CREATE VIEW public.dlq_statistics AS
WITH failure_code_counts AS (
  SELECT
    user_id,
    COALESCE(failure_code, 'unknown') AS failure_code,
    COUNT(*) AS cnt
  FROM healing_dlq
  WHERE status = 'pending'
  GROUP BY user_id, COALESCE(failure_code, 'unknown')
),
failure_code_agg AS (
  SELECT
    user_id,
    jsonb_object_agg(failure_code, cnt) AS pending_by_failure_code
  FROM failure_code_counts
  GROUP BY user_id
)
SELECT
  d.user_id,
  COUNT(*) FILTER (WHERE d.status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE d.status = 'retrying') AS retrying_count,
  COUNT(*) FILTER (WHERE d.status = 'resolved') AS resolved_count,
  COUNT(*) FILTER (WHERE d.status = 'archived') AS archived_count,
  COUNT(*) FILTER (WHERE d.status = 'discarded') AS discarded_count,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE d.alert_sent = TRUE AND d.alert_acknowledged = FALSE) AS unacknowledged_alerts,
  MIN(d.created_at) FILTER (WHERE d.status = 'pending') AS oldest_pending_at,
  MAX(d.created_at) AS newest_entry_at,
  COALESCE(f.pending_by_failure_code, '{}'::jsonb) AS pending_by_failure_code
FROM healing_dlq d
LEFT JOIN failure_code_agg f ON f.user_id = d.user_id
GROUP BY d.user_id, f.pending_by_failure_code;

COMMENT ON VIEW public.dlq_statistics IS 'Statistics view for Dead Letter Queue - recreated without SECURITY DEFINER';

-- #############################################
-- PART 2: 061_answer_contract.sql functions
-- #############################################

-- get_applicable_contract_policy
CREATE OR REPLACE FUNCTION get_applicable_contract_policy(
  p_user_id UUID,
  p_collection_id UUID DEFAULT NULL
)
RETURNS contract_policies AS $$
DECLARE
  v_policy contract_policies;
BEGIN
  -- First try collection-specific policy
  IF p_collection_id IS NOT NULL THEN
    SELECT * INTO v_policy
    FROM contract_policies
    WHERE user_id = p_user_id
      AND collection_id = p_collection_id
      AND is_active = TRUE
    ORDER BY priority DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_policy;
    END IF;
  END IF;

  -- Then try default policy
  SELECT * INTO v_policy
  FROM contract_policies
  WHERE user_id = p_user_id
    AND collection_id IS NULL
    AND is_active = TRUE
    AND is_default = TRUE
  ORDER BY priority DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_policy;
  END IF;

  -- Finally, any active policy
  SELECT * INTO v_policy
  FROM contract_policies
  WHERE user_id = p_user_id
    AND is_active = TRUE
  ORDER BY priority DESC
  LIMIT 1;

  RETURN v_policy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_contract_stats
CREATE OR REPLACE FUNCTION get_contract_stats(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
  v_stats JSON;
BEGIN
  SELECT json_build_object(
    'total_evaluations', COUNT(*),
    'pass_count', COUNT(*) FILTER (WHERE verdict = 'pass'),
    'partial_count', COUNT(*) FILTER (WHERE verdict = 'partial'),
    'fail_count', COUNT(*) FILTER (WHERE verdict = 'fail'),
    'abstain_count', COUNT(*) FILTER (WHERE verdict = 'abstain'),
    'avg_grounding_score', ROUND(AVG(grounding_score)::numeric, 3),
    'avg_faithfulness_score', ROUND(AVG(faithfulness_score)::numeric, 3),
    'avg_coverage_score', ROUND(AVG(coverage_score)::numeric, 3),
    'pass_rate', ROUND(
      (COUNT(*) FILTER (WHERE verdict = 'pass')::float / NULLIF(COUNT(*), 0) * 100)::numeric, 1
    ),
    'avg_processing_time_ms', ROUND(AVG(processing_time_ms)::numeric, 0)
  ) INTO v_stats
  FROM answer_contracts
  WHERE user_id = p_user_id
    AND created_at >= NOW() - (p_days || ' days')::interval;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- setup_default_contract_policy
CREATE OR REPLACE FUNCTION setup_default_contract_policy(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_policy_id UUID;
BEGIN
  INSERT INTO contract_policies (
    user_id,
    name,
    description,
    is_default
  ) VALUES (
    p_user_id,
    'Default Policy',
    'Automatically created default answer contract policy',
    TRUE
  )
  RETURNING id INTO v_policy_id;

  RETURN v_policy_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- #############################################
-- PART 3: 062_adaptive_planner.sql functions
-- #############################################

-- find_matching_plan
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_plan_performance_summary
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- learn_plan_from_selections
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- #############################################
-- PART 4: 063_autopilot_retrieval.sql functions
-- #############################################

-- get_or_create_autopilot_retrieval_config
CREATE OR REPLACE FUNCTION get_or_create_autopilot_retrieval_config(
  p_user_id TEXT,
  p_collection_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_config_id UUID;
BEGIN
  -- Try to find existing config
  SELECT id INTO v_config_id
  FROM autopilot_retrieval_configs
  WHERE user_id = p_user_id
    AND (
      (p_collection_id IS NULL AND collection_id IS NULL) OR
      (collection_id = p_collection_id)
    );

  -- Create if not exists
  IF v_config_id IS NULL THEN
    INSERT INTO autopilot_retrieval_configs (user_id, collection_id)
    VALUES (p_user_id, p_collection_id)
    RETURNING id INTO v_config_id;

    -- Initialize strategy stats
    INSERT INTO autopilot_strategy_stats (config_id, strategy)
    VALUES
      (v_config_id, 'vector'),
      (v_config_id, 'hybrid'),
      (v_config_id, 'keyword'),
      (v_config_id, 'multi_query'),
      (v_config_id, 'hyde');
  END IF;

  RETURN v_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- record_autopilot_decision
CREATE OR REPLACE FUNCTION record_autopilot_decision(
  p_config_id UUID,
  p_trace_id UUID,
  p_query_text TEXT,
  p_chosen_strategy TEXT,
  p_strategy_params JSONB,
  p_decision_reason TEXT,
  p_was_exploration BOOLEAN,
  p_pre_decision_weights JSONB,
  p_latency_ms FLOAT,
  p_relevance_score FLOAT,
  p_cost FLOAT,
  p_result_count INTEGER,
  p_reward FLOAT,
  p_reward_components JSONB
)
RETURNS UUID AS $$
DECLARE
  v_decision_id UUID;
  v_query_length INTEGER;
BEGIN
  v_query_length := LENGTH(p_query_text);

  INSERT INTO autopilot_retrieval_decisions (
    config_id, trace_id, query_text, query_length,
    chosen_strategy, strategy_params, decision_reason, was_exploration,
    pre_decision_weights, latency_ms, relevance_score, cost, result_count,
    reward, reward_components
  )
  VALUES (
    p_config_id, p_trace_id, p_query_text, v_query_length,
    p_chosen_strategy, p_strategy_params, p_decision_reason, p_was_exploration,
    p_pre_decision_weights, p_latency_ms, p_relevance_score, p_cost, p_result_count,
    p_reward, p_reward_components
  )
  RETURNING id INTO v_decision_id;

  RETURN v_decision_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- update_autopilot_strategy_stats
CREATE OR REPLACE FUNCTION update_autopilot_strategy_stats(
  p_config_id UUID,
  p_strategy TEXT,
  p_latency_ms FLOAT,
  p_relevance FLOAT,
  p_cost FLOAT,
  p_reward FLOAT
)
RETURNS VOID AS $$
DECLARE
  v_is_success BOOLEAN;
BEGIN
  v_is_success := p_reward > 0.5;

  UPDATE autopilot_strategy_stats
  SET
    total_uses = total_uses + 1,
    total_successes = total_successes + (CASE WHEN v_is_success THEN 1 ELSE 0 END),
    avg_latency_ms = (avg_latency_ms * total_uses + p_latency_ms) / (total_uses + 1),
    avg_relevance = (avg_relevance * total_uses + p_relevance) / (total_uses + 1),
    avg_cost = (avg_cost * total_uses + p_cost) / (total_uses + 1),
    avg_reward = (avg_reward * total_uses + p_reward) / (total_uses + 1),
    success_rate = (total_successes + (CASE WHEN v_is_success THEN 1 ELSE 0 END))::FLOAT / (total_uses + 1),
    -- Update Thompson Sampling parameters
    beta_alpha = beta_alpha + (CASE WHEN v_is_success THEN 1 ELSE 0 END),
    beta_beta = beta_beta + (CASE WHEN NOT v_is_success THEN 1 ELSE 0 END),
    updated_at = NOW()
  WHERE config_id = p_config_id AND strategy = p_strategy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- update_autopilot_strategy_weights
CREATE OR REPLACE FUNCTION update_autopilot_strategy_weights(
  p_config_id UUID,
  p_new_weights JSONB
)
RETURNS VOID AS $$
BEGIN
  UPDATE autopilot_retrieval_configs
  SET
    strategy_weights = p_new_weights,
    updated_at = NOW()
  WHERE id = p_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- record_autopilot_feedback
CREATE OR REPLACE FUNCTION record_autopilot_feedback(
  p_decision_id UUID,
  p_feedback TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE autopilot_retrieval_decisions
  SET
    user_feedback = p_feedback,
    feedback_at = NOW()
  WHERE id = p_decision_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_autopilot_strategy_summary
CREATE OR REPLACE FUNCTION get_autopilot_strategy_summary(
  p_config_id UUID
)
RETURNS TABLE (
  strategy TEXT,
  total_uses INTEGER,
  success_rate FLOAT,
  avg_reward FLOAT,
  avg_latency_ms FLOAT,
  avg_relevance FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.strategy,
    s.total_uses,
    s.success_rate,
    s.avg_reward,
    s.avg_latency_ms,
    s.avg_relevance
  FROM autopilot_strategy_stats s
  WHERE s.config_id = p_config_id
  ORDER BY s.avg_reward DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- refresh_autopilot_recent_stats
CREATE OR REPLACE FUNCTION refresh_autopilot_recent_stats(
  p_config_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE autopilot_strategy_stats s
  SET
    recent_uses = subq.cnt,
    recent_avg_relevance = subq.avg_rel,
    recent_avg_reward = subq.avg_rew,
    recent_success_rate = subq.success_rate,
    updated_at = NOW()
  FROM (
    SELECT
      d.chosen_strategy AS strategy,
      COUNT(*)::INTEGER AS cnt,
      AVG(d.relevance_score) AS avg_rel,
      AVG(d.reward) AS avg_rew,
      AVG(CASE WHEN d.reward > 0.5 THEN 1.0 ELSE 0.0 END) AS success_rate
    FROM autopilot_retrieval_decisions d
    WHERE d.config_id = p_config_id
      AND d.created_at > NOW() - INTERVAL '24 hours'
    GROUP BY d.chosen_strategy
  ) subq
  WHERE s.config_id = p_config_id
    AND s.strategy = subq.strategy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- #############################################
-- PART 5: 064_hybrid_orchestrator.sql functions
-- #############################################

-- get_or_create_default_hybrid_config
CREATE OR REPLACE FUNCTION get_or_create_default_hybrid_config(
  p_user_id UUID,
  p_collection_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_config_id UUID;
BEGIN
  -- Try to find existing default config
  SELECT id INTO v_config_id
  FROM hybrid_configs
  WHERE user_id = p_user_id
    AND (collection_id = p_collection_id OR (collection_id IS NULL AND p_collection_id IS NULL))
    AND name = 'default'
    AND is_active = TRUE
  LIMIT 1;

  -- Create if not exists
  IF v_config_id IS NULL THEN
    INSERT INTO hybrid_configs (
      user_id,
      collection_id,
      name,
      strategies,
      fusion_method
    ) VALUES (
      p_user_id,
      p_collection_id,
      'default',
      '[
        {"type": "vector", "weight": 0.7, "params": {"top_k": 20}},
        {"type": "keyword", "weight": 0.3, "params": {"top_k": 20}}
      ]'::jsonb,
      'rrf'
    )
    RETURNING id INTO v_config_id;
  END IF;

  RETURN v_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- record_hybrid_result
CREATE OR REPLACE FUNCTION record_hybrid_result(
  p_config_id UUID,
  p_user_id UUID,
  p_trace_id UUID,
  p_query_hash TEXT,
  p_collection_id UUID,
  p_strategy_results JSONB,
  p_fused_results JSONB,
  p_fusion_method TEXT,
  p_total_latency_ms FLOAT,
  p_strategy_latencies JSONB
)
RETURNS UUID AS $$
DECLARE
  v_result_id UUID;
BEGIN
  INSERT INTO hybrid_results (
    config_id,
    user_id,
    trace_id,
    query_hash,
    collection_id,
    strategy_results,
    fused_results,
    fusion_method,
    total_latency_ms,
    strategy_latencies
  ) VALUES (
    p_config_id,
    p_user_id,
    p_trace_id,
    p_query_hash,
    p_collection_id,
    p_strategy_results,
    p_fused_results,
    p_fusion_method,
    p_total_latency_ms,
    p_strategy_latencies
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- update_learned_weights
CREATE OR REPLACE FUNCTION update_learned_weights(
  p_config_id UUID,
  p_feedback_score FLOAT,
  p_clicked_positions INTEGER[]
)
RETURNS VOID AS $$
DECLARE
  v_current_weights JSONB;
  v_strategy_count INTEGER;
BEGIN
  -- Get current config
  SELECT learned_weights, jsonb_array_length(strategies)
  INTO v_current_weights, v_strategy_count
  FROM hybrid_configs
  WHERE id = p_config_id;

  -- Initialize weights if null
  IF v_current_weights IS NULL THEN
    v_current_weights = '{}'::jsonb;
  END IF;

  -- Simple exponential moving average update
  UPDATE hybrid_configs
  SET
    learned_weights = jsonb_set(
      COALESCE(learned_weights, '{}'::jsonb),
      '{feedback_count}',
      to_jsonb(COALESCE((learned_weights->>'feedback_count')::integer, 0) + 1)
    ),
    updated_at = NOW()
  WHERE id = p_config_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- #############################################
-- PART 6: 065_budget_planning.sql functions
-- #############################################

-- record_query_cost
CREATE OR REPLACE FUNCTION record_query_cost(
  p_user_id UUID,
  p_trace_id UUID,
  p_embedding_cost FLOAT DEFAULT 0,
  p_rerank_cost FLOAT DEFAULT 0,
  p_llm_cost FLOAT DEFAULT 0,
  p_storage_cost FLOAT DEFAULT 0,
  p_embedding_model TEXT DEFAULT NULL,
  p_embedding_tokens INTEGER DEFAULT 0,
  p_rerank_model TEXT DEFAULT NULL,
  p_rerank_pairs INTEGER DEFAULT 0,
  p_llm_model TEXT DEFAULT NULL,
  p_llm_tokens_in INTEGER DEFAULT 0,
  p_llm_tokens_out INTEGER DEFAULT 0,
  p_query_type TEXT DEFAULT 'search',
  p_result_count INTEGER DEFAULT 0,
  p_latency_ms INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_total_cost FLOAT;
  v_budget RECORD;
  v_was_over_budget BOOLEAN := FALSE;
  v_alert_needed TEXT := NULL;
  v_cost_id UUID;
BEGIN
  -- Calculate total cost
  v_total_cost := COALESCE(p_embedding_cost, 0) +
                  COALESCE(p_rerank_cost, 0) +
                  COALESCE(p_llm_cost, 0) +
                  COALESCE(p_storage_cost, 0);

  -- Get or create budget record
  INSERT INTO retrieval_budgets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE
  SET updated_at = NOW()
  RETURNING * INTO v_budget;

  -- Check if over daily budget before recording
  IF v_budget.daily_spent_usd + v_total_cost > v_budget.daily_budget_usd THEN
    v_was_over_budget := TRUE;
  END IF;

  -- Record the cost
  INSERT INTO query_costs (
    user_id, trace_id, embedding_cost, rerank_cost, llm_cost, storage_cost, total_cost,
    embedding_model, embedding_tokens, rerank_model, rerank_pairs,
    llm_model, llm_tokens_in, llm_tokens_out, query_type, result_count, latency_ms,
    was_over_budget
  ) VALUES (
    p_user_id, p_trace_id, p_embedding_cost, p_rerank_cost, p_llm_cost, p_storage_cost, v_total_cost,
    p_embedding_model, p_embedding_tokens, p_rerank_model, p_rerank_pairs,
    p_llm_model, p_llm_tokens_in, p_llm_tokens_out, p_query_type, p_result_count, p_latency_ms,
    v_was_over_budget
  ) RETURNING id INTO v_cost_id;

  -- Update budget spent
  UPDATE retrieval_budgets
  SET
    daily_spent_usd = daily_spent_usd + v_total_cost,
    monthly_spent_usd = monthly_spent_usd + v_total_cost,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_budget;

  -- Check for daily alert threshold
  IF NOT v_budget.alert_sent_daily AND
     v_budget.daily_spent_usd >= (v_budget.daily_budget_usd * v_budget.alert_at_percent / 100) THEN
    v_alert_needed := 'daily_threshold';

    UPDATE retrieval_budgets
    SET alert_sent_daily = TRUE
    WHERE user_id = p_user_id;

    INSERT INTO budget_alerts (user_id, alert_type, threshold_pct, current_spent, budget_limit, title, message)
    VALUES (
      p_user_id, 'daily_threshold', v_budget.alert_at_percent, v_budget.daily_spent_usd, v_budget.daily_budget_usd,
      'Daily budget threshold reached',
      format('You have used %s%% of your daily budget ($%.4f of $%.2f)',
             v_budget.alert_at_percent, v_budget.daily_spent_usd, v_budget.daily_budget_usd)
    );
  END IF;

  -- Check for monthly alert threshold
  IF NOT v_budget.alert_sent_monthly AND
     v_budget.monthly_spent_usd >= (v_budget.monthly_budget_usd * v_budget.alert_at_percent / 100) THEN
    IF v_alert_needed IS NULL THEN
      v_alert_needed := 'monthly_threshold';
    END IF;

    UPDATE retrieval_budgets
    SET alert_sent_monthly = TRUE
    WHERE user_id = p_user_id;

    INSERT INTO budget_alerts (user_id, alert_type, threshold_pct, current_spent, budget_limit, title, message)
    VALUES (
      p_user_id, 'monthly_threshold', v_budget.alert_at_percent, v_budget.monthly_spent_usd, v_budget.monthly_budget_usd,
      'Monthly budget threshold reached',
      format('You have used %s%% of your monthly budget ($%.4f of $%.2f)',
             v_budget.alert_at_percent, v_budget.monthly_spent_usd, v_budget.monthly_budget_usd)
    );
  END IF;

  -- Update daily summary
  INSERT INTO daily_cost_summary (user_id, date, total_queries, total_cost_usd,
    embedding_cost_usd, rerank_cost_usd, llm_cost_usd, storage_cost_usd,
    total_embedding_tokens, total_llm_tokens_in, total_llm_tokens_out)
  VALUES (
    p_user_id, CURRENT_DATE, 1, v_total_cost,
    COALESCE(p_embedding_cost, 0), COALESCE(p_rerank_cost, 0), COALESCE(p_llm_cost, 0), COALESCE(p_storage_cost, 0),
    COALESCE(p_embedding_tokens, 0), COALESCE(p_llm_tokens_in, 0), COALESCE(p_llm_tokens_out, 0)
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    total_queries = daily_cost_summary.total_queries + 1,
    total_cost_usd = daily_cost_summary.total_cost_usd + v_total_cost,
    embedding_cost_usd = daily_cost_summary.embedding_cost_usd + COALESCE(p_embedding_cost, 0),
    rerank_cost_usd = daily_cost_summary.rerank_cost_usd + COALESCE(p_rerank_cost, 0),
    llm_cost_usd = daily_cost_summary.llm_cost_usd + COALESCE(p_llm_cost, 0),
    storage_cost_usd = daily_cost_summary.storage_cost_usd + COALESCE(p_storage_cost, 0),
    total_embedding_tokens = daily_cost_summary.total_embedding_tokens + COALESCE(p_embedding_tokens, 0),
    total_llm_tokens_in = daily_cost_summary.total_llm_tokens_in + COALESCE(p_llm_tokens_in, 0),
    total_llm_tokens_out = daily_cost_summary.total_llm_tokens_out + COALESCE(p_llm_tokens_out, 0),
    over_budget_queries = daily_cost_summary.over_budget_queries + CASE WHEN v_was_over_budget THEN 1 ELSE 0 END,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'cost_id', v_cost_id,
    'total_cost', v_total_cost,
    'daily_spent', v_budget.daily_spent_usd,
    'monthly_spent', v_budget.monthly_spent_usd,
    'daily_budget', v_budget.daily_budget_usd,
    'monthly_budget', v_budget.monthly_budget_usd,
    'was_over_budget', v_was_over_budget,
    'alert_triggered', v_alert_needed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- check_budget_status
CREATE OR REPLACE FUNCTION check_budget_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_budget RECORD;
  v_daily_remaining FLOAT;
  v_monthly_remaining FLOAT;
  v_daily_pct FLOAT;
  v_monthly_pct FLOAT;
BEGIN
  -- Get budget record (auto-reset if needed)
  SELECT * INTO v_budget
  FROM retrieval_budgets
  WHERE user_id = p_user_id;

  IF v_budget IS NULL THEN
    -- Return defaults
    RETURN jsonb_build_object(
      'has_budget', FALSE,
      'daily_budget', 10.0,
      'monthly_budget', 100.0,
      'per_query_max', 0.05,
      'daily_spent', 0,
      'monthly_spent', 0,
      'daily_remaining', 10.0,
      'monthly_remaining', 100.0,
      'daily_usage_pct', 0,
      'monthly_usage_pct', 0,
      'mode', 'soft',
      'is_over_daily', FALSE,
      'is_over_monthly', FALSE
    );
  END IF;

  -- Check for resets
  IF v_budget.last_reset_daily::DATE < CURRENT_DATE THEN
    UPDATE retrieval_budgets
    SET daily_spent_usd = 0, last_reset_daily = NOW(), alert_sent_daily = FALSE
    WHERE user_id = p_user_id
    RETURNING * INTO v_budget;
  END IF;

  IF DATE_TRUNC('month', v_budget.last_reset_monthly) < DATE_TRUNC('month', NOW()) THEN
    UPDATE retrieval_budgets
    SET monthly_spent_usd = 0, last_reset_monthly = NOW(), alert_sent_monthly = FALSE
    WHERE user_id = p_user_id
    RETURNING * INTO v_budget;
  END IF;

  -- Calculate remaining and percentages
  v_daily_remaining := GREATEST(0, v_budget.daily_budget_usd - v_budget.daily_spent_usd);
  v_monthly_remaining := GREATEST(0, v_budget.monthly_budget_usd - v_budget.monthly_spent_usd);
  v_daily_pct := CASE WHEN v_budget.daily_budget_usd > 0
                      THEN (v_budget.daily_spent_usd / v_budget.daily_budget_usd) * 100
                      ELSE 0 END;
  v_monthly_pct := CASE WHEN v_budget.monthly_budget_usd > 0
                        THEN (v_budget.monthly_spent_usd / v_budget.monthly_budget_usd) * 100
                        ELSE 0 END;

  RETURN jsonb_build_object(
    'has_budget', TRUE,
    'daily_budget', v_budget.daily_budget_usd,
    'monthly_budget', v_budget.monthly_budget_usd,
    'per_query_max', v_budget.per_query_max_usd,
    'daily_spent', v_budget.daily_spent_usd,
    'monthly_spent', v_budget.monthly_spent_usd,
    'daily_remaining', v_daily_remaining,
    'monthly_remaining', v_monthly_remaining,
    'daily_usage_pct', v_daily_pct,
    'monthly_usage_pct', v_monthly_pct,
    'mode', v_budget.mode,
    'fallback_strategy', v_budget.fallback_strategy,
    'is_over_daily', v_budget.daily_spent_usd >= v_budget.daily_budget_usd,
    'is_over_monthly', v_budget.monthly_spent_usd >= v_budget.monthly_budget_usd,
    'alert_at_percent', v_budget.alert_at_percent
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- #############################################
-- PART 7: 066_self_healing.sql functions
-- #############################################

-- update_index_health
CREATE OR REPLACE FUNCTION update_index_health(
  p_collection_id UUID,
  p_user_id UUID,
  p_total_chunks INTEGER,
  p_healthy_chunks INTEGER,
  p_stale_chunks INTEGER,
  p_orphaned_chunks INTEGER,
  p_missing_embeddings INTEGER,
  p_corrupted_chunks INTEGER DEFAULT 0,
  p_check_duration_ms INTEGER DEFAULT NULL
) RETURNS index_health AS $$
DECLARE
  v_health_score FLOAT;
  v_freshness_score FLOAT;
  v_consistency_score FLOAT;
  v_status TEXT;
  v_previous_score FLOAT;
  v_trend TEXT;
  v_result index_health;
BEGIN
  -- Calculate scores
  v_health_score := calculate_health_score(
    p_total_chunks, p_healthy_chunks, p_stale_chunks, p_orphaned_chunks, p_missing_embeddings
  );

  v_freshness_score := CASE
    WHEN p_total_chunks = 0 THEN 1.0
    ELSE (p_total_chunks - p_stale_chunks)::FLOAT / p_total_chunks::FLOAT
  END;

  v_consistency_score := CASE
    WHEN p_total_chunks = 0 THEN 1.0
    ELSE (p_total_chunks - p_corrupted_chunks - p_missing_embeddings)::FLOAT / p_total_chunks::FLOAT
  END;

  v_status := get_health_status(v_health_score);

  -- Get previous score for trend calculation
  SELECT health_score INTO v_previous_score
  FROM index_health
  WHERE collection_id = p_collection_id;

  -- Calculate trend
  IF v_previous_score IS NULL THEN
    v_trend := 'stable';
  ELSIF v_health_score > v_previous_score + 0.05 THEN
    v_trend := 'improving';
  ELSIF v_health_score < v_previous_score - 0.05 THEN
    v_trend := 'degrading';
  ELSE
    v_trend := 'stable';
  END IF;

  -- Upsert health record
  INSERT INTO index_health (
    collection_id, user_id, total_chunks, healthy_chunks, stale_chunks,
    orphaned_chunks, missing_embeddings, corrupted_chunks,
    health_score, freshness_score, consistency_score, coverage_score,
    status, last_checked_at, check_duration_ms,
    previous_health_score, score_trend, updated_at
  ) VALUES (
    p_collection_id, p_user_id, p_total_chunks, p_healthy_chunks, p_stale_chunks,
    p_orphaned_chunks, p_missing_embeddings, p_corrupted_chunks,
    v_health_score, v_freshness_score, v_consistency_score,
    CASE WHEN p_total_chunks = 0 THEN 1.0 ELSE 1.0 END,
    v_status, NOW(), p_check_duration_ms,
    v_previous_score, v_trend, NOW()
  )
  ON CONFLICT (collection_id) DO UPDATE SET
    total_chunks = EXCLUDED.total_chunks,
    healthy_chunks = EXCLUDED.healthy_chunks,
    stale_chunks = EXCLUDED.stale_chunks,
    orphaned_chunks = EXCLUDED.orphaned_chunks,
    missing_embeddings = EXCLUDED.missing_embeddings,
    corrupted_chunks = EXCLUDED.corrupted_chunks,
    health_score = EXCLUDED.health_score,
    freshness_score = EXCLUDED.freshness_score,
    consistency_score = EXCLUDED.consistency_score,
    coverage_score = EXCLUDED.coverage_score,
    status = EXCLUDED.status,
    last_checked_at = EXCLUDED.last_checked_at,
    check_duration_ms = EXCLUDED.check_duration_ms,
    previous_health_score = index_health.health_score,
    score_trend = EXCLUDED.score_trend,
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- #############################################
-- PART 8: 20260202_004_enterprise_policies.sql functions
-- #############################################

-- is_under_legal_hold
CREATE OR REPLACE FUNCTION is_under_legal_hold(
  p_org_id UUID,
  p_data_type TEXT,
  p_record_id UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_hold retention_legal_holds;
  v_scope_config JSONB;
BEGIN
  FOR v_hold IN
    SELECT * FROM retention_legal_holds
    WHERE organization_id = p_org_id
    AND status = 'active'
    AND (effective_until IS NULL OR effective_until > now())
  LOOP
    v_scope_config := v_hold.scope_config;

    IF v_hold.scope_type = 'all' THEN
      RETURN TRUE;
    END IF;

    IF v_hold.scope_type = 'user' AND p_user_id IS NOT NULL THEN
      IF p_user_id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_scope_config->'user_ids'))) THEN
        RETURN TRUE;
      END IF;
    END IF;

    IF v_hold.scope_type = 'tag' AND p_tags IS NOT NULL THEN
      IF p_tags && ARRAY(SELECT jsonb_array_elements_text(v_scope_config->'tags'))::TEXT[] THEN
        RETURN TRUE;
      END IF;
    END IF;

    IF v_hold.scope_type = 'date_range' AND p_created_at IS NOT NULL THEN
      IF p_created_at >= (v_scope_config->>'start_date')::TIMESTAMPTZ
         AND p_created_at <= (v_scope_config->>'end_date')::TIMESTAMPTZ THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_effective_retention_days
CREATE OR REPLACE FUNCTION get_effective_retention_days(
  p_org_id UUID,
  p_data_type TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_retention_days INTEGER;
BEGIN
  SELECT retention_days INTO v_retention_days
  FROM retention_schedules
  WHERE organization_id = p_org_id
  AND data_type = p_data_type
  AND is_active = true
  ORDER BY priority DESC
  LIMIT 1;

  IF v_retention_days IS NULL THEN
    SELECT (config->>'retention_days')::INTEGER INTO v_retention_days
    FROM winter_org_policies
    WHERE organization_id = p_org_id
    AND policy_type = 'retention_policy'
    AND is_active = true
    ORDER BY priority DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_retention_days, 90);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_active_opa_policies
CREATE OR REPLACE FUNCTION get_active_opa_policies(
  p_organization_id UUID,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  rego_code TEXT,
  priority INTEGER,
  scope JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    op.id,
    op.name,
    op.category,
    op.rego_code,
    op.priority,
    op.scope
  FROM opa_policies op
  WHERE op.organization_id = p_organization_id
    AND op.is_active = true
    AND (p_category IS NULL OR op.category = p_category)
  ORDER BY op.priority DESC, op.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- record_opa_decision
CREATE OR REPLACE FUNCTION record_opa_decision(
  p_organization_id UUID,
  p_principal_type TEXT,
  p_principal_id TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_operation TEXT,
  p_allowed BOOLEAN,
  p_reason TEXT DEFAULT NULL,
  p_policy_id UUID DEFAULT NULL,
  p_evaluation_time_ms INTEGER DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO opa_policy_decisions (
    organization_id, principal_type, principal_id,
    resource_type, resource_id, operation,
    allowed, reason, policy_id,
    evaluation_time_ms, ip_address, request_id
  ) VALUES (
    p_organization_id, p_principal_type, p_principal_id,
    p_resource_type, p_resource_id, p_operation,
    p_allowed, p_reason, p_policy_id,
    p_evaluation_time_ms, p_ip_address, p_request_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_opa_decision_stats
CREATE OR REPLACE FUNCTION get_opa_decision_stats(
  p_organization_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_decisions BIGINT,
  allowed_count BIGINT,
  denied_count BIGINT,
  allow_rate NUMERIC,
  by_operation JSONB,
  by_resource_type JSONB,
  top_denied_resources JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE allowed = true) as allowed,
      COUNT(*) FILTER (WHERE allowed = false) as denied
    FROM opa_policy_decisions
    WHERE organization_id = p_organization_id
      AND created_at BETWEEN p_start_date AND p_end_date
  ),
  by_op AS (
    SELECT jsonb_object_agg(operation, cnt) as data
    FROM (
      SELECT operation, COUNT(*) as cnt
      FROM opa_policy_decisions
      WHERE organization_id = p_organization_id
        AND created_at BETWEEN p_start_date AND p_end_date
      GROUP BY operation
    ) sub
  ),
  by_resource AS (
    SELECT jsonb_object_agg(COALESCE(resource_type, 'unknown'), cnt) as data
    FROM (
      SELECT resource_type, COUNT(*) as cnt
      FROM opa_policy_decisions
      WHERE organization_id = p_organization_id
        AND created_at BETWEEN p_start_date AND p_end_date
      GROUP BY resource_type
    ) sub
  ),
  top_denied AS (
    SELECT jsonb_agg(jsonb_build_object(
      'resource_type', resource_type,
      'resource_id', resource_id,
      'count', cnt,
      'reason', reason
    ) ORDER BY cnt DESC) as data
    FROM (
      SELECT resource_type, resource_id, reason, COUNT(*) as cnt
      FROM opa_policy_decisions
      WHERE organization_id = p_organization_id
        AND created_at BETWEEN p_start_date AND p_end_date
        AND allowed = false
      GROUP BY resource_type, resource_id, reason
      ORDER BY cnt DESC
      LIMIT 10
    ) sub
  )
  SELECT
    s.total, s.allowed, s.denied,
    CASE WHEN s.total > 0 THEN ROUND(s.allowed::NUMERIC / s.total * 100, 2) ELSE 0 END,
    COALESCE(bo.data, '{}'::JSONB),
    COALESCE(br.data, '{}'::JSONB),
    COALESCE(td.data, '[]'::JSONB)
  FROM stats s
  CROSS JOIN by_op bo
  CROSS JOIN by_resource br
  CROSS JOIN top_denied td;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- create_policy_version (winter policy versioning)
CREATE OR REPLACE FUNCTION create_policy_version(
  p_policy_id UUID,
  p_created_by TEXT,
  p_change_summary TEXT DEFAULT NULL,
  p_change_type VARCHAR(20) DEFAULT 'update'
)
RETURNS UUID AS $$
DECLARE
  v_policy RECORD;
  v_version INT;
  v_version_id UUID;
BEGIN
  SELECT * INTO v_policy
  FROM winter_org_policies
  WHERE id = p_policy_id;

  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'Policy not found: %', p_policy_id;
  END IF;

  v_version := get_next_policy_version(p_policy_id);

  INSERT INTO winter_org_policy_versions (
    policy_id, organization_id, version, state,
    policy_type, name, description, config, scope, priority,
    change_summary, change_type, created_by
  ) VALUES (
    p_policy_id, v_policy.organization_id, v_version, 'draft',
    v_policy.policy_type, v_policy.name, v_policy.description,
    v_policy.config, v_policy.scope, v_policy.priority,
    p_change_summary, p_change_type, p_created_by
  )
  RETURNING id INTO v_version_id;

  UPDATE winter_org_policies
  SET draft_version_id = v_version_id
  WHERE id = p_policy_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- publish_policy_version
CREATE OR REPLACE FUNCTION publish_policy_version(
  p_version_id UUID,
  p_published_by TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_version RECORD;
  v_policy_id UUID;
BEGIN
  SELECT * INTO v_version
  FROM winter_org_policy_versions
  WHERE id = p_version_id AND state = 'draft';

  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Version not found or not in draft state: %', p_version_id;
  END IF;

  v_policy_id := v_version.policy_id;

  UPDATE winter_org_policy_versions
  SET state = 'archived',
      superseded_at = NOW(),
      superseded_by = p_version_id
  WHERE policy_id = v_policy_id
    AND state = 'published';

  UPDATE winter_org_policy_versions
  SET state = 'published',
      published_at = NOW(),
      published_by = p_published_by
  WHERE id = p_version_id;

  UPDATE winter_org_policies
  SET config = v_version.config,
      name = v_version.name,
      description = v_version.description,
      scope = v_version.scope,
      priority = v_version.priority,
      current_version = v_version.version,
      draft_version_id = NULL,
      updated_at = NOW()
  WHERE id = v_policy_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- rollback_policy_to_version
CREATE OR REPLACE FUNCTION rollback_policy_to_version(
  p_policy_id UUID,
  p_target_version INT,
  p_rolled_back_by TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_target RECORD;
  v_new_version_id UUID;
  v_new_version INT;
BEGIN
  SELECT * INTO v_target
  FROM winter_org_policy_versions
  WHERE policy_id = p_policy_id AND version = p_target_version;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Version % not found for policy %', p_target_version, p_policy_id;
  END IF;

  v_new_version := get_next_policy_version(p_policy_id);

  INSERT INTO winter_org_policy_versions (
    policy_id, organization_id, version, state,
    policy_type, name, description, config, scope, priority,
    change_summary, change_type, created_by
  ) VALUES (
    p_policy_id, v_target.organization_id, v_new_version, 'draft',
    v_target.policy_type, v_target.name, v_target.description,
    v_target.config, v_target.scope, v_target.priority,
    COALESCE(p_reason, 'Rollback to version ' || p_target_version),
    'rollback',
    p_rolled_back_by
  )
  RETURNING id INTO v_new_version_id;

  UPDATE winter_org_policies
  SET draft_version_id = v_new_version_id
  WHERE id = p_policy_id;

  RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- save_opa_policy_version
CREATE OR REPLACE FUNCTION save_opa_policy_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.rego_code IS DISTINCT FROM NEW.rego_code THEN
    INSERT INTO opa_policy_versions (
      policy_id, version, rego_code, change_summary, created_by
    ) VALUES (
      OLD.id, OLD.version, OLD.rego_code,
      'Auto-saved before update', COALESCE(auth.uid(), OLD.created_by)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- audit_policy_version_changes
CREATE OR REPLACE FUNCTION audit_policy_version_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_org_audit_event(
      NEW.created_by, NEW.organization_id,
      'policy.version_create', 'policy_versions', NEW.id,
      jsonb_build_object(
        'policy_id', NEW.policy_id,
        'version', NEW.version,
        'change_type', NEW.change_type,
        'change_summary', NEW.change_summary
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.state = 'draft' AND NEW.state = 'published' THEN
      PERFORM log_org_audit_event(
        NEW.published_by, NEW.organization_id,
        'policy.version_publish', 'policy_versions', NEW.id,
        jsonb_build_object('policy_id', NEW.policy_id, 'version', NEW.version)
      );
    ELSIF OLD.state = 'published' AND NEW.state = 'archived' THEN
      PERFORM log_org_audit_event(
        NULL, NEW.organization_id,
        'policy.version_archive', 'policy_versions', NEW.id,
        jsonb_build_object(
          'policy_id', NEW.policy_id,
          'version', NEW.version,
          'superseded_by', NEW.superseded_by
        )
      );
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- #############################################
-- COMMENTS
-- #############################################

COMMENT ON VIEW public.dlq_statistics IS 'Statistics view for Dead Letter Queue - recreated without SECURITY DEFINER';
