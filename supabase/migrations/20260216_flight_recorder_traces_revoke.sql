-- Migration: 20260216_flight_recorder_traces_revoke.sql
-- Description: Restrict flight_recorder_traces view access to service_role only.
--
-- Context:
-- `flight_recorder_traces` is a compatibility view over `fall_retrieval_traces`.
-- Even with `security_invoker=true`, granting access to `anon`/`authenticated`
-- increases blast radius and complicates future RLS/auth changes.
--
-- This migration revokes all privileges for `anon` and `authenticated` and
-- explicitly grants SELECT to `service_role` only.

REVOKE ALL ON public.flight_recorder_traces FROM anon;
REVOKE ALL ON public.flight_recorder_traces FROM authenticated;

-- Make intent explicit (service_role is used by server-side API routes).
GRANT SELECT ON public.flight_recorder_traces TO service_role;

-- Notify PostgREST to reload schema cache.
NOTIFY pgrst, 'reload schema';

