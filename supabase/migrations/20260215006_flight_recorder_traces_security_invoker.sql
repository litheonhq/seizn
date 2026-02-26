-- Migration: 20260215_flight_recorder_traces_security_invoker.sql
-- Description: Ensure flight_recorder_traces view cannot bypass RLS on fall_retrieval_traces.
--
-- Context:
-- `flight_recorder_traces` is a compatibility view over `fall_retrieval_traces`.
-- When a view is owned by the table owner (often `postgres`) it can accidentally
-- evaluate RLS as the owner and bypass policies. Postgres 15+ supports
-- `security_invoker` views, which enforce permissions/RLS as the caller.

ALTER VIEW public.flight_recorder_traces
  SET (security_invoker = true);

-- Helps Supabase/PostgREST pick up the updated view options quickly.
NOTIFY pgrst, 'reload schema';

