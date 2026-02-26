-- Migration: 20260222_002_fix_search_path_mutable.sql
-- Description: Fix Supabase Security Advisor lint 0011 (function_search_path_mutable)
--   for 4 functions added after the previous fix (20260217).
--
-- Approach: ALTER FUNCTION ... SET search_path = '' (empty = safest default).

-- 1. set_learning_profile_updated_at (trigger, from 20260221)
ALTER FUNCTION public.set_learning_profile_updated_at()
  SET search_path = '';

-- 2. companion_analytics (from 20260222_001)
ALTER FUNCTION public.companion_analytics(timestamptz, text)
  SET search_path = '';

-- 3. companion_top_scenarios (from 20260222_001)
ALTER FUNCTION public.companion_top_scenarios(timestamptz, int)
  SET search_path = '';

-- 4. companion_unhappy_combos (from 20260222_001)
ALTER FUNCTION public.companion_unhappy_combos(timestamptz)
  SET search_path = '';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
