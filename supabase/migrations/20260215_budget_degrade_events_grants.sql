-- Seizn - Budget Degrade Events Grants (defense in depth)
-- Migration: 20260215_budget_degrade_events_grants.sql
--
-- Supabase often grants broad table privileges to anon/authenticated by default.
-- RLS still applies to SELECT/INSERT/UPDATE/DELETE, but this narrows exposure and
-- aligns with "least privilege" for production.

REVOKE ALL ON budget_degrade_events FROM anon;
REVOKE ALL ON budget_degrade_events FROM public;
REVOKE ALL ON budget_degrade_events FROM authenticated;

GRANT SELECT, INSERT ON budget_degrade_events TO authenticated;
GRANT ALL ON budget_degrade_events TO service_role;

