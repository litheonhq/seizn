-- Migration: Fix SECURITY DEFINER Views with correct column names
-- Date: 2026-01-23
-- Fixes 5 views, skips 3 (tables don't exist)

-- ============================================================
-- 1. cost_pending_recommendations (user_id, type instead of org_id, recommendation_type)
-- ============================================================
DROP VIEW IF EXISTS public.cost_pending_recommendations;
CREATE OR REPLACE VIEW public.cost_pending_recommendations
WITH (security_invoker = true)
AS
SELECT
  user_id,
  type as recommendation_type,
  COUNT(*) as pending_count,
  SUM(estimated_savings_usd) as total_potential_savings
FROM cost_recommendations
WHERE status = 'pending'
GROUP BY user_id, type;

-- ============================================================
-- 2. summer_indexing_stats (user_id instead of org_id)
-- ============================================================
DROP VIEW IF EXISTS public.summer_indexing_stats;
CREATE OR REPLACE VIEW public.summer_indexing_stats
WITH (security_invoker = true)
AS
SELECT
  user_id,
  COUNT(*) as total_documents,
  COUNT(*) FILTER (WHERE status = 'indexed') as indexed_documents,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_documents,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_documents,
  SUM(chunk_count) as total_chunks
FROM summer_documents
GROUP BY user_id;

-- ============================================================
-- 3. auto_pr_analyses_summary (user_id, merged_at instead of org_id, pr_merged)
-- ============================================================
DROP VIEW IF EXISTS public.auto_pr_analyses_summary;
CREATE OR REPLACE VIEW public.auto_pr_analyses_summary
WITH (security_invoker = true)
AS
SELECT
  user_id,
  DATE(created_at) as analysis_date,
  COUNT(*) as total_analyses,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_analyses,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_analyses,
  COUNT(*) FILTER (WHERE merged_at IS NOT NULL) as merged_prs
FROM auto_pr_records
GROUP BY user_id, DATE(created_at);

-- ============================================================
-- 4. cost_savings_daily (user_id, estimated_savings_usd instead of org_id, actual_savings)
-- ============================================================
DROP VIEW IF EXISTS public.cost_savings_daily;
CREATE OR REPLACE VIEW public.cost_savings_daily
WITH (security_invoker = true)
AS
SELECT
  user_id,
  DATE(applied_at) as savings_date,
  SUM(estimated_savings_usd) as daily_savings,
  COUNT(*) as recommendations_applied
FROM cost_recommendations
WHERE status = 'applied' AND applied_at IS NOT NULL
GROUP BY user_id, DATE(applied_at);

-- ============================================================
-- 5. v_rtbf_dashboard (requester_id instead of org_id)
-- ============================================================
DROP VIEW IF EXISTS public.v_rtbf_dashboard;
CREATE OR REPLACE VIEW public.v_rtbf_dashboard
WITH (security_invoker = true)
AS
SELECT
  requester_id,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_requests,
  COUNT(*) FILTER (WHERE status = 'processing') as processing_requests,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_requests,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_requests,
  COUNT(*) as total_requests,
  MAX(completed_at) as last_completed_at
FROM winter_rtbf_requests
GROUP BY requester_id;

-- ============================================================
-- SKIPPED VIEWS (tables don't exist):
-- - cost_tiering_overview (summer_document_chunks doesn't exist)
-- - fall_trace_stats (fall_traces doesn't exist)
-- - nih_grant_stats (nih_grants doesn't exist)
-- ============================================================

-- Drop non-functional views
DROP VIEW IF EXISTS public.cost_tiering_overview;
DROP VIEW IF EXISTS public.fall_trace_stats;
DROP VIEW IF EXISTS public.nih_grant_stats;
