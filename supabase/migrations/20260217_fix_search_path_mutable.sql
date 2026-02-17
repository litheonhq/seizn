-- Migration: 20260217_fix_search_path_mutable.sql
-- Description: Fix Supabase Security Advisor lint 0011 (function_search_path_mutable)
--   for all 11 remaining functions that lack SET search_path.
--   (search_memories UUID overload already fixed in 20260215_e2e_memory_encryption_fix_search_overload.sql)
--
-- Approach: ALTER FUNCTION ... SET search_path = '' (empty = safest default).
-- Using empty string rather than 'public' ensures no implicit schema resolution,
-- since all table references in these functions already use explicit public.* or
-- are trigger functions that operate on the calling table's schema.

-- 1. save_memory_content_history (trigger)
ALTER FUNCTION public.save_memory_content_history()
  SET search_path = '';

-- 2. update_provider_key_usage
ALTER FUNCTION public.update_provider_key_usage(UUID, NUMERIC)
  SET search_path = '';

-- 3. update_provider_keys_updated_at (trigger)
ALTER FUNCTION public.update_provider_keys_updated_at()
  SET search_path = '';

-- 4. get_pending_autopilot_fixes_count
ALTER FUNCTION public.get_pending_autopilot_fixes_count(TEXT)
  SET search_path = '';

-- 5. apply_autopilot_fix
ALTER FUNCTION public.apply_autopilot_fix(UUID, TEXT)
  SET search_path = '';

-- 6. rollback_autopilot_fix
ALTER FUNCTION public.rollback_autopilot_fix(UUID, TEXT, TEXT)
  SET search_path = '';

-- 7. update_autopilot_fixes_updated_at (trigger)
ALTER FUNCTION public.update_autopilot_fixes_updated_at()
  SET search_path = '';

-- 8. update_autopilot_prs_updated_at (trigger)
ALTER FUNCTION public.update_autopilot_prs_updated_at()
  SET search_path = '';

-- 9. update_autopilot_configs_updated_at (trigger)
ALTER FUNCTION public.update_autopilot_configs_updated_at()
  SET search_path = '';

-- 10. keyword_search_memories
ALTER FUNCTION public.keyword_search_memories(TEXT, TEXT, INT, TEXT)
  SET search_path = '';

-- 11. hybrid_search_memories
ALTER FUNCTION public.hybrid_search_memories(TEXT, vector(1024), TEXT, INT, FLOAT, TEXT, FLOAT, FLOAT)
  SET search_path = '';

-- 12. search_memories (TEXT overload — the UUID overload was already fixed)
ALTER FUNCTION public.search_memories(vector(1024), TEXT, INT, FLOAT, TEXT)
  SET search_path = '';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
