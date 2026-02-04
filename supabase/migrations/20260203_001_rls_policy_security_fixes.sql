-- Migration: 20260203_001_rls_policy_security_fixes.sql
-- Description: Fix RLS policies that use 'true' without proper role restriction
-- Fixes: Supabase Security Linter warnings for overly permissive RLS policies
-- Created: 2026-02-03

-- =============================================================
-- PART 1: Fix SECURITY DEFINER view (ERROR level)
-- =============================================================

-- Drop and recreate view without SECURITY DEFINER
DROP VIEW IF EXISTS public.winter_rtbf_verification_summary;

CREATE OR REPLACE VIEW public.winter_rtbf_verification_summary
WITH (security_invoker = true)
AS
SELECT
  r.id AS request_id,
  r.requester_id,
  r.subject_id,
  r.scope,
  r.status AS request_status,
  r.verification_hash,
  r.verified_at,
  (r.verification_hash IS NOT NULL) AS is_verified,
  COUNT(e.id) AS evidence_count,
  COALESCE(SUM(e.records_deleted), 0) AS total_records_deleted
FROM winter_rtbf_requests r
LEFT JOIN winter_rtbf_evidence e ON e.request_id = r.id
GROUP BY r.id;

GRANT SELECT ON public.winter_rtbf_verification_summary TO authenticated;

-- =============================================================
-- PART 2: Fix Service Role policies (add TO service_role)
-- These policies use 'true' but should only apply to service_role
-- =============================================================

-- api_keys: Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role full access api_keys" ON public.api_keys;
CREATE POLICY "Service role full access api_keys"
  ON public.api_keys FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- memories: Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role full access memories" ON public.memories;
CREATE POLICY "Service role full access memories"
  ON public.memories FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- profiles: Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;
CREATE POLICY "Service role full access profiles"
  ON public.profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- spring_conversations: Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role full access spring_conversations" ON public.spring_conversations;
CREATE POLICY "Service role full access spring_conversations"
  ON public.spring_conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- spring_generated_media: Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role full access spring_generated_media" ON public.spring_generated_media;
CREATE POLICY "Service role full access spring_generated_media"
  ON public.spring_generated_media FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- spring_messages: Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role full access spring_messages" ON public.spring_messages;
CREATE POLICY "Service role full access spring_messages"
  ON public.spring_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- spring_usage: Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role full access spring_usage" ON public.spring_usage;
CREATE POLICY "Service role full access spring_usage"
  ON public.spring_usage FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- usage_logs: Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role full access usage_logs" ON public.usage_logs;
CREATE POLICY "Service role full access usage_logs"
  ON public.usage_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================
-- PART 3: Fix System INSERT policies (service-side logging)
-- =============================================================

-- opa_policy_decisions: Service role only
DROP POLICY IF EXISTS "Service can record OPA decisions" ON public.opa_policy_decisions;
CREATE POLICY "Service can record OPA decisions"
  ON public.opa_policy_decisions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- retention_execution_log: Service role only
DROP POLICY IF EXISTS "System can insert execution log" ON public.retention_execution_log;
CREATE POLICY "System can insert execution log"
  ON public.retention_execution_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- winter_rtbf_audit_logs INSERT: Service role only
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.winter_rtbf_audit_logs;
CREATE POLICY "Service role can insert audit logs"
  ON public.winter_rtbf_audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- winter_rtbf_audit_logs UPDATE: Service role only
DROP POLICY IF EXISTS "Service role can update audit logs" ON public.winter_rtbf_audit_logs;
CREATE POLICY "Service role can update audit logs"
  ON public.winter_rtbf_audit_logs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- winter_rtbf_backups: Service role only
DROP POLICY IF EXISTS "Service role can manage backups" ON public.winter_rtbf_backups;
CREATE POLICY "Service role can manage backups"
  ON public.winter_rtbf_backups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- winter_rtbf_evidence: Service role only
DROP POLICY IF EXISTS "Service can manage evidence" ON public.winter_rtbf_evidence;
CREATE POLICY "Service can manage evidence"
  ON public.winter_rtbf_evidence FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================
-- PART 4: Fix Public INSERT policies
-- These are intentionally public but add validation
-- =============================================================

-- enterprise_inquiries: Public insert with field validation
DROP POLICY IF EXISTS "Allow public insert" ON public.enterprise_inquiries;
CREATE POLICY "Allow public insert"
  ON public.enterprise_inquiries FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Validate required fields are present and reasonable
    email IS NOT NULL AND
    email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND
    company_name IS NOT NULL AND
    char_length(company_name) > 0 AND
    char_length(company_name) <= 200
  );

-- waitlist: Public insert with email validation
DROP POLICY IF EXISTS "Allow public insert" ON public.waitlist;
CREATE POLICY "Allow public insert"
  ON public.waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Validate email format
    email IS NOT NULL AND
    email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

-- =============================================================
-- PART 5: Grant necessary permissions
-- =============================================================

-- Ensure service_role can access these tables
GRANT ALL ON public.api_keys TO service_role;
GRANT ALL ON public.memories TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.spring_conversations TO service_role;
GRANT ALL ON public.spring_generated_media TO service_role;
GRANT ALL ON public.spring_messages TO service_role;
GRANT ALL ON public.spring_usage TO service_role;
GRANT ALL ON public.usage_logs TO service_role;
GRANT ALL ON public.opa_policy_decisions TO service_role;
GRANT ALL ON public.retention_execution_log TO service_role;
GRANT ALL ON public.winter_rtbf_audit_logs TO service_role;
GRANT ALL ON public.winter_rtbf_backups TO service_role;
GRANT ALL ON public.winter_rtbf_evidence TO service_role;

-- Public tables for forms
GRANT INSERT ON public.enterprise_inquiries TO anon;
GRANT INSERT ON public.enterprise_inquiries TO authenticated;
GRANT INSERT ON public.waitlist TO anon;
GRANT INSERT ON public.waitlist TO authenticated;
