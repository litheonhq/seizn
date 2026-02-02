-- Migration: 20260202_009_security_fixes_v3.sql
-- Description: Final security fixes
-- - Fix dlq_statistics view with explicit SECURITY INVOKER
-- - Add SET search_path to remaining functions (non-SECURITY DEFINER)
-- Based on Supabase Security Advisor reports (files 9 & 10)
-- Created: 2026-02-02

-- #############################################
-- PART 1: Fix dlq_statistics view with SECURITY INVOKER
-- #############################################

-- PostgreSQL 15+ supports SECURITY INVOKER for views
-- For older versions, we drop and recreate
DROP VIEW IF EXISTS public.dlq_statistics;

CREATE VIEW public.dlq_statistics
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW public.dlq_statistics IS 'Statistics view for Dead Letter Queue - SECURITY INVOKER enabled';

-- #############################################
-- PART 2: SSO functions (20260202_002)
-- #############################################

-- find_sso_connection_by_email (DROP first due to RETURNS TABLE)
DROP FUNCTION IF EXISTS find_sso_connection_by_email(TEXT);

CREATE OR REPLACE FUNCTION find_sso_connection_by_email(p_email TEXT)
RETURNS TABLE (
  connection_id UUID,
  organization_id UUID,
  provider TEXT,
  idp_entity_id TEXT
) AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Extract domain from email
  v_domain := split_part(p_email, '@', 2);

  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sc.id AS connection_id,
    sc.organization_id,
    sc.provider,
    sc.idp_entity_id
  FROM sso_connections sc
  WHERE sc.is_active = TRUE
    AND v_domain = ANY(sc.email_domains)
  ORDER BY sc.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- generate_sp_entity_id
CREATE OR REPLACE FUNCTION generate_sp_entity_id(p_org_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN 'urn:seizn:sp:' || p_org_id::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- generate_sp_acs_url
CREATE OR REPLACE FUNCTION generate_sp_acs_url(p_org_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN 'https://seizn.com/api/auth/sso/callback/' || p_org_id::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- create_sso_connection
CREATE OR REPLACE FUNCTION create_sso_connection(
  p_organization_id UUID,
  p_provider TEXT,
  p_idp_entity_id TEXT,
  p_idp_sso_url TEXT,
  p_idp_certificate TEXT,
  p_email_domains TEXT[],
  p_created_by TEXT
)
RETURNS UUID AS $$
DECLARE
  v_connection_id UUID;
  v_sp_entity_id TEXT;
  v_sp_acs_url TEXT;
BEGIN
  -- Generate SP metadata
  v_sp_entity_id := generate_sp_entity_id(p_organization_id);
  v_sp_acs_url := generate_sp_acs_url(p_organization_id);

  -- Insert connection
  INSERT INTO sso_connections (
    organization_id,
    provider,
    idp_entity_id,
    idp_sso_url,
    idp_certificate,
    sp_entity_id,
    sp_acs_url,
    email_domains,
    created_by
  ) VALUES (
    p_organization_id,
    p_provider,
    p_idp_entity_id,
    p_idp_sso_url,
    p_idp_certificate,
    v_sp_entity_id,
    v_sp_acs_url,
    p_email_domains,
    p_created_by
  )
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- #############################################
-- PART 3: Answer contract functions (061)
-- #############################################

-- evaluate_contract_verdict (not SECURITY DEFINER, but needs search_path)
CREATE OR REPLACE FUNCTION evaluate_contract_verdict(
  p_grounding_score FLOAT,
  p_faithfulness_score FLOAT,
  p_coverage_score FLOAT,
  p_evidence_count INTEGER,
  p_unsupported_count INTEGER,
  p_policy_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_policy contract_policies;
  v_verdict TEXT;
BEGIN
  -- Get policy
  SELECT * INTO v_policy
  FROM contract_policies
  WHERE id = p_policy_id;

  IF NOT FOUND THEN
    -- No policy, use defaults
    IF p_grounding_score >= 0.7 AND p_faithfulness_score >= 0.8 THEN
      RETURN 'pass';
    ELSIF p_grounding_score >= 0.5 OR p_faithfulness_score >= 0.5 THEN
      RETURN 'partial';
    ELSE
      RETURN 'fail';
    END IF;
  END IF;

  -- Evaluate against policy thresholds
  IF p_evidence_count < v_policy.min_evidence_chunks THEN
    RETURN 'abstain';
  END IF;

  IF p_unsupported_count > v_policy.max_unsupported_claims THEN
    RETURN 'fail';
  END IF;

  IF p_grounding_score >= v_policy.min_grounding_score
     AND p_faithfulness_score >= v_policy.min_faithfulness_score
     AND p_coverage_score >= v_policy.min_coverage_score THEN
    RETURN 'pass';
  ELSIF p_grounding_score >= v_policy.min_grounding_score * 0.7
     OR p_faithfulness_score >= v_policy.min_faithfulness_score * 0.7 THEN
    RETURN 'partial';
  ELSE
    RETURN 'fail';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- update_contract_policy_timestamp (trigger function)
CREATE OR REPLACE FUNCTION update_contract_policy_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- #############################################
-- PART 4: Adaptive planner functions (062)
-- #############################################

-- update_plan_metrics (trigger function)
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
$$ LANGUAGE plpgsql SET search_path = public;

-- update_query_plans_updated_at (trigger function)
CREATE OR REPLACE FUNCTION update_query_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- #############################################
-- PART 5: Autopilot retrieval functions (063)
-- #############################################

-- update_autopilot_retrieval_config_timestamp (trigger function)
CREATE OR REPLACE FUNCTION update_autopilot_retrieval_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- #############################################
-- PART 6: Hybrid orchestrator functions (064)
-- #############################################

-- cleanup_expired_mq_cache
CREATE OR REPLACE FUNCTION cleanup_expired_mq_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM multi_query_cache
    WHERE expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- update_hybrid_configs_updated_at (trigger function)
CREATE OR REPLACE FUNCTION update_hybrid_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- #############################################
-- PART 7: Budget planning functions (065)
-- #############################################

-- reset_daily_budget (trigger function)
CREATE OR REPLACE FUNCTION reset_daily_budget()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if we need to reset (new day)
  IF NEW.last_reset_daily::DATE < CURRENT_DATE THEN
    NEW.daily_spent_usd := 0;
    NEW.last_reset_daily := NOW();
    NEW.alert_sent_daily := FALSE;
  END IF;

  -- Check if we need to reset monthly (new month)
  IF DATE_TRUNC('month', NEW.last_reset_monthly) < DATE_TRUNC('month', NOW()) THEN
    NEW.monthly_spent_usd := 0;
    NEW.last_reset_monthly := NOW();
    NEW.alert_sent_monthly := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- #############################################
-- PART 8: Self-healing functions (066)
-- #############################################

-- calculate_health_score (IMMUTABLE)
CREATE OR REPLACE FUNCTION calculate_health_score(
  p_total_chunks INTEGER,
  p_healthy_chunks INTEGER,
  p_stale_chunks INTEGER,
  p_orphaned_chunks INTEGER,
  p_missing_embeddings INTEGER
) RETURNS FLOAT AS $$
DECLARE
  v_health_score FLOAT;
  v_healthy_ratio FLOAT;
  v_stale_penalty FLOAT;
  v_orphan_penalty FLOAT;
  v_missing_penalty FLOAT;
BEGIN
  IF p_total_chunks = 0 THEN
    RETURN 1.0;
  END IF;

  -- Base score from healthy chunks
  v_healthy_ratio := p_healthy_chunks::FLOAT / p_total_chunks::FLOAT;

  -- Apply penalties for issues (weighted by severity)
  v_stale_penalty := (p_stale_chunks::FLOAT / p_total_chunks::FLOAT) * 0.3;
  v_orphan_penalty := (p_orphaned_chunks::FLOAT / p_total_chunks::FLOAT) * 0.5;
  v_missing_penalty := (p_missing_embeddings::FLOAT / p_total_chunks::FLOAT) * 0.8;

  -- Calculate final score
  v_health_score := v_healthy_ratio - v_stale_penalty - v_orphan_penalty - v_missing_penalty;

  -- Clamp to 0-1 range
  RETURN GREATEST(0.0, LEAST(1.0, v_health_score));
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- get_health_status (IMMUTABLE)
CREATE OR REPLACE FUNCTION get_health_status(p_health_score FLOAT) RETURNS TEXT AS $$
BEGIN
  IF p_health_score >= 0.9 THEN
    RETURN 'healthy';
  ELSIF p_health_score >= 0.7 THEN
    RETURN 'warning';
  ELSIF p_health_score >= 0.5 THEN
    RETURN 'degraded';
  ELSE
    RETURN 'critical';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- #############################################
-- PART 9: Enterprise policies functions (004)
-- #############################################

-- get_next_policy_version
CREATE OR REPLACE FUNCTION get_next_policy_version(p_policy_id UUID)
RETURNS INT AS $$
DECLARE
  v_max_version INT;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO v_max_version
  FROM winter_org_policy_versions
  WHERE policy_id = p_policy_id;

  RETURN v_max_version + 1;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- compare_policy_versions
CREATE OR REPLACE FUNCTION compare_policy_versions(
  p_version_id_a UUID,
  p_version_id_b UUID
)
RETURNS JSONB AS $$
DECLARE
  v_a RECORD;
  v_b RECORD;
  v_diff JSONB;
BEGIN
  SELECT * INTO v_a FROM winter_org_policy_versions WHERE id = p_version_id_a;
  SELECT * INTO v_b FROM winter_org_policy_versions WHERE id = p_version_id_b;

  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'One or both versions not found';
  END IF;

  v_diff := jsonb_build_object(
    'version_a', jsonb_build_object(
      'id', v_a.id, 'version', v_a.version,
      'state', v_a.state, 'created_at', v_a.created_at
    ),
    'version_b', jsonb_build_object(
      'id', v_b.id, 'version', v_b.version,
      'state', v_b.state, 'created_at', v_b.created_at
    ),
    'changes', jsonb_build_object(
      'name', CASE WHEN v_a.name != v_b.name
        THEN jsonb_build_object('from', v_a.name, 'to', v_b.name) ELSE NULL END,
      'description', CASE WHEN v_a.description IS DISTINCT FROM v_b.description
        THEN jsonb_build_object('from', v_a.description, 'to', v_b.description) ELSE NULL END,
      'config', CASE WHEN v_a.config != v_b.config
        THEN jsonb_build_object('from', v_a.config, 'to', v_b.config) ELSE NULL END,
      'scope', CASE WHEN v_a.scope != v_b.scope
        THEN jsonb_build_object('from', v_a.scope, 'to', v_b.scope) ELSE NULL END,
      'priority', CASE WHEN v_a.priority != v_b.priority
        THEN jsonb_build_object('from', v_a.priority, 'to', v_b.priority) ELSE NULL END
    )
  );

  RETURN v_diff;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- update_byok_kms_configs_updated_at (trigger function)
CREATE OR REPLACE FUNCTION update_byok_kms_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- update_retention_legal_holds_updated_at (trigger function)
CREATE OR REPLACE FUNCTION update_retention_legal_holds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- update_retention_schedules_updated_at (trigger function)
CREATE OR REPLACE FUNCTION update_retention_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- update_opa_policies_updated_at (trigger function)
CREATE OR REPLACE FUNCTION update_opa_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- #############################################
-- COMMENTS
-- #############################################

COMMENT ON VIEW public.dlq_statistics IS 'Statistics view for Dead Letter Queue - SECURITY INVOKER enabled';
