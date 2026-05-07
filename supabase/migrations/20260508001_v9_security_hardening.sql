-- v9 launch — Supabase database linter hot-fix.
--
-- Linter warnings detected after the v9 cutover:
--   1. function_search_path_mutable on public.funnel_events_reject_mutation
--   2. function_search_path_mutable on public.managed_entitlements_touch_updated_at
--   3. anon_security_definer_function_executable on public.increment_feature_usage
--   4. authenticated_security_definer_function_executable on public.increment_feature_usage
--
-- Fixes:
--   #1, #2 — pin search_path = public so a malicious schema in the role
--           search_path can't shadow `public.feature_usage_log` etc. and
--           hijack the trigger's SECURITY DEFINER context.
--   #3, #4 — REVOKE EXECUTE from anon and authenticated. The function is
--           server-only (called from feature-gate.ts via service_role).
--           Supabase grants EXECUTE to anon/authenticated by default on
--           public schema functions; the original migration only
--           REVOKE'd from PUBLIC, which doesn't cover the per-role
--           grants.

-- 1 & 2: pin trigger function search_path.
ALTER FUNCTION public.funnel_events_reject_mutation()
  SET search_path = public;

ALTER FUNCTION public.managed_entitlements_touch_updated_at()
  SET search_path = public;

-- 3 & 4: revoke RPC access from anon and authenticated. service_role still
-- retains EXECUTE from the prior migration's GRANT.
REVOKE EXECUTE ON FUNCTION public.increment_feature_usage(UUID, TEXT, DATE)
  FROM anon, authenticated;
