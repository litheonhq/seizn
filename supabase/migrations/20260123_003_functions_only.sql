-- Migration: Fix Function Search Path Only
-- Date: 2026-01-23
-- Skips views (schema mismatch), only fixes function search_path warnings

-- ============================================================
-- Fix Function Search Path (safe with error handling)
-- ============================================================

DO $$
DECLARE
  func_record RECORD;
  fixed_count INTEGER := 0;
  skipped_count INTEGER := 0;
BEGIN
  FOR func_record IN
    SELECT
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prokind = 'f'
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public',
        func_record.function_name,
        func_record.args
      );
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      skipped_count := skipped_count + 1;
    END;
  END LOOP;
  RAISE NOTICE 'Function search_path fix: % fixed, % skipped', fixed_count, skipped_count;
END;
$$;

-- Extensions schema setup
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- DONE
-- Views skipped due to schema mismatch - fix manually if needed
-- Manual: Enable "Leaked Password Protection" in Dashboard > Auth
