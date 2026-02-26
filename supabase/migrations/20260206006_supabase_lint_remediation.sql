-- =============================================================================
-- Supabase Security Lint Remediation
--
-- Fixes:
--   1. SECURITY DEFINER views → security_invoker = true  (5 ERROR)
--   2. Functions without search_path set                  (60+ WARN)
--   3. Overly permissive RLS policies                     (3 WARN)
--
-- Reference: Supabase Database Linter
--   - lint 0010: security_definer_view
--   - lint 0011: function_search_path_mutable
--   - lint 0024: rls_policy_always_true
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Fix SECURITY DEFINER Views (ERROR)
--
-- By default PostgreSQL views run as the view owner (security_invoker = false).
-- This bypasses RLS of the querying user. Setting security_invoker = true makes
-- the view respect the caller's permissions.
-- =============================================================================

ALTER VIEW IF EXISTS public.gateway_cost_summary_by_model
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.gateway_cost_summary_by_user
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.gateway_cost_summary_by_org
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.hnsw_index_health
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.spring_hnsw_index_health
  SET (security_invoker = true);

-- =============================================================================
-- 2. Fix Function Search Path Mutable (WARN)
--
-- Functions without an explicit search_path can be exploited by placing
-- malicious objects in a schema earlier in the search_path. Setting
-- search_path = 'public' pins resolution to the public schema.
--
-- Uses a DO block to dynamically fix ALL public functions missing search_path.
-- =============================================================================

DO $$
DECLARE
  func_record RECORD;
  fixed_count INT := 0;
  skipped_count INT := 0;
BEGIN
  FOR func_record IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')  -- functions and procedures
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(p.proconfig) AS c
          WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public',
        func_record.schema_name,
        func_record.function_name,
        func_record.identity_args
      );
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Some entries may be procedures, try ALTER PROCEDURE
      BEGIN
        EXECUTE format(
          'ALTER PROCEDURE %I.%I(%s) SET search_path = public',
          func_record.schema_name,
          func_record.function_name,
          func_record.identity_args
        );
        fixed_count := fixed_count + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipped %.%(%): %',
          func_record.schema_name,
          func_record.function_name,
          func_record.identity_args,
          SQLERRM;
        skipped_count := skipped_count + 1;
      END;
    END;
  END LOOP;

  RAISE NOTICE 'search_path fix: % functions fixed, % skipped', fixed_count, skipped_count;
END;
$$;

-- =============================================================================
-- 3. Fix RLS Policies Always True (WARN)
--
-- These policies use USING(true) / WITH CHECK(true) without restricting to
-- a specific role, effectively bypassing RLS for all roles.
-- =============================================================================

-- 3a. oidc_auth_requests: restrict ALL operations to service_role only
--     (OIDC auth requests should only be managed server-side)
DROP POLICY IF EXISTS oidc_auth_requests_service_only ON public.oidc_auth_requests;
CREATE POLICY oidc_auth_requests_service_only
  ON public.oidc_auth_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3b. sso_sessions: restrict INSERT to service_role only
--     (SSO sessions should only be created server-side)
DROP POLICY IF EXISTS sso_sessions_insert ON public.sso_sessions;
CREATE POLICY sso_sessions_insert
  ON public.sso_sessions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 3c. spring_memory_usage: restrict INSERT to service_role only
--     (Usage records should only be inserted by server-side services)
DROP POLICY IF EXISTS "Service role can insert usage records" ON public.spring_memory_usage;
CREATE POLICY "Service role can insert usage records"
  ON public.spring_memory_usage
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMIT;
