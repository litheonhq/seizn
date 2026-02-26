-- Migration: 20260202_015_security_lint_fixes.sql
-- Description: Fix Supabase security linter errors
-- Fixes: SECURITY DEFINER view, RLS disabled on public tables
-- Created: 2026-02-02

-- #############################################
-- PART 1: Fix SECURITY DEFINER view
-- #############################################

-- Recreate view without SECURITY DEFINER
DROP VIEW IF EXISTS winter_rtbf_verification_summary;

CREATE VIEW winter_rtbf_verification_summary AS
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

-- Grant access (RLS on underlying tables will control access)
GRANT SELECT ON winter_rtbf_verification_summary TO authenticated;

-- #############################################
-- PART 2: Enable RLS on agent_tools
-- #############################################

ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;

-- Anyone can view active tools (tool registry is public info)
CREATE POLICY "Anyone can view active tools"
  ON agent_tools FOR SELECT
  USING (is_active = true);

-- Only service role can manage tools (no direct user access)
CREATE POLICY "Service role can manage tools"
  ON agent_tools FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- #############################################
-- PART 3: Enable RLS on agent_tool_executions
-- #############################################

ALTER TABLE agent_tool_executions ENABLE ROW LEVEL SECURITY;

-- Org members can view their org's executions
CREATE POLICY "Org members can view executions"
  ON agent_tool_executions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()::text
    )
  );

-- Service role can insert executions (backend only)
CREATE POLICY "Service role can manage executions"
  ON agent_tool_executions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- #############################################
-- PART 4: Enable RLS on policy_packs
-- #############################################

ALTER TABLE policy_packs ENABLE ROW LEVEL SECURITY;

-- Anyone can view public packs
CREATE POLICY "Anyone can view public packs"
  ON policy_packs FOR SELECT
  USING (visibility = 'public');

-- Authenticated users can view unlisted packs
CREATE POLICY "Authenticated can view unlisted packs"
  ON policy_packs FOR SELECT
  TO authenticated
  USING (visibility = 'unlisted');

-- Service role can manage all packs (no org ownership column exists)
CREATE POLICY "Service role can manage all packs"
  ON policy_packs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- #############################################
-- PART 5: Enable RLS on policy_pack_versions
-- #############################################

ALTER TABLE policy_pack_versions ENABLE ROW LEVEL SECURITY;

-- Anyone can view published versions of public packs
CREATE POLICY "Anyone can view published versions"
  ON policy_pack_versions FOR SELECT
  USING (
    status = 'published' AND
    pack_id IN (SELECT id FROM policy_packs WHERE visibility = 'public')
  );

-- Authenticated can view published versions of unlisted packs
CREATE POLICY "Authenticated can view unlisted versions"
  ON policy_pack_versions FOR SELECT
  TO authenticated
  USING (
    status = 'published' AND
    pack_id IN (SELECT id FROM policy_packs WHERE visibility = 'unlisted')
  );

-- Service role can manage all versions
CREATE POLICY "Service role can manage all versions"
  ON policy_pack_versions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- #############################################
-- PART 6: Enable RLS on policy_pack_reviews
-- #############################################

ALTER TABLE policy_pack_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view reviews
CREATE POLICY "Anyone can view reviews"
  ON policy_pack_reviews FOR SELECT
  USING (true);

-- Users can create their own reviews
CREATE POLICY "Users can create own reviews"
  ON policy_pack_reviews FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own reviews
CREATE POLICY "Users can update own reviews"
  ON policy_pack_reviews FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own reviews
CREATE POLICY "Users can delete own reviews"
  ON policy_pack_reviews FOR DELETE
  USING (user_id = auth.uid());

-- Service role can manage all reviews
CREATE POLICY "Service role can manage all reviews"
  ON policy_pack_reviews FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
