-- Migration: network learning policy updates compatibility
-- Purpose:
-- 1) Add compatibility view expected by application code (`network_learning_policy_updates`)
-- 2) Expand target_policy CHECK constraint to accept planner.* policy targets

BEGIN;

-- Ensure base table exists before building compatibility layer.
DO $$
BEGIN
  IF to_regclass('public.network_policy_updates') IS NULL THEN
    RAISE EXCEPTION 'Required table public.network_policy_updates does not exist';
  END IF;
END $$;

-- App code writes/reads through this relation name.
CREATE OR REPLACE VIEW public.network_learning_policy_updates
WITH (security_invoker = true) AS
SELECT *
FROM public.network_policy_updates;

-- Keep schema validation aligned with app-emitted target policies.
ALTER TABLE public.network_policy_updates
  DROP CONSTRAINT IF EXISTS network_policy_updates_target_policy_check;

ALTER TABLE public.network_policy_updates
  DROP CONSTRAINT IF EXISTS network_learning_policy_updates_target_policy_check;

ALTER TABLE public.network_policy_updates
  ADD CONSTRAINT network_policy_updates_target_policy_check
  CHECK (
    target_policy IN (
      'retrieval_strategy',
      'ranking_weights',
      'timeout_thresholds',
      'cache_strategy',
      'fallback_order',
      'quality_thresholds',
      'custom',
      'planner.latency_budget',
      'planner.performance_alert',
      'planner.default_path',
      'planner.rerank_config',
      'planner.quality_threshold',
      'planner.preferred_paths'
    )
  );

COMMENT ON VIEW public.network_learning_policy_updates IS
  'Compatibility view for network policy updates used by network-learning app code';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.network_learning_policy_updates TO service_role;

COMMIT;
