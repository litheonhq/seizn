-- Migration: 20260202_012_deletion_verification.sql
-- Description: Add deletion verification (RTBF proof) schema
-- Extends existing winter_rtbf_requests with verification capabilities
-- Created: 2026-02-02

-- #############################################
-- PART 1: Extend winter_rtbf_requests table
-- #############################################

ALTER TABLE winter_rtbf_requests
ADD COLUMN IF NOT EXISTS verification_hash TEXT,
ADD COLUMN IF NOT EXISTS verification_algorithm TEXT DEFAULT 'SHA-256',
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_by TEXT,
ADD COLUMN IF NOT EXISTS affected_artifacts JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS deletion_proof JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS evidence_exported_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS evidence_format TEXT,
ADD COLUMN IF NOT EXISTS organization_id UUID;

COMMENT ON COLUMN winter_rtbf_requests.verification_hash IS 'Cryptographic hash of deletion evidence';

-- #############################################
-- PART 2: Deletion evidence table
-- #############################################

CREATE TABLE IF NOT EXISTS winter_rtbf_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES winter_rtbf_requests(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  table_name TEXT,
  column_name TEXT,
  records_found INTEGER NOT NULL DEFAULT 0,
  records_deleted INTEGER NOT NULL DEFAULT 0,
  records_retained INTEGER NOT NULL DEFAULT 0,
  pre_deletion_hash TEXT,
  post_deletion_hash TEXT,
  deletion_query TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtbf_evidence_request_id ON winter_rtbf_evidence(request_id);
CREATE INDEX IF NOT EXISTS idx_rtbf_evidence_status ON winter_rtbf_evidence(status);

ALTER TABLE winter_rtbf_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own evidence"
  ON winter_rtbf_evidence FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winter_rtbf_requests r
      WHERE r.id = winter_rtbf_evidence.request_id
        AND (auth.uid()::TEXT = r.requester_id OR auth.uid()::TEXT = r.subject_id)
    )
  );

CREATE POLICY "Service can manage evidence"
  ON winter_rtbf_evidence FOR ALL
  USING (true)
  WITH CHECK (true);

-- #############################################
-- PART 3: Verification functions
-- #############################################

CREATE OR REPLACE FUNCTION generate_deletion_verification(p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_hash TEXT;
  v_evidence_data TEXT;
BEGIN
  SELECT string_agg(
    COALESCE(e.table_name, 'unknown') || ':' || e.records_deleted::TEXT,
    '|' ORDER BY e.table_name
  )
  INTO v_evidence_data
  FROM winter_rtbf_evidence e
  WHERE e.request_id = p_request_id AND e.status = 'completed';

  IF v_evidence_data IS NULL THEN
    RAISE EXCEPTION 'No completed evidence found for request %', p_request_id;
  END IF;

  v_hash := encode(sha256(v_evidence_data::bytea), 'hex');

  UPDATE winter_rtbf_requests
  SET verification_hash = v_hash, verification_algorithm = 'SHA-256', verified_at = NOW()
  WHERE id = p_request_id;

  RETURN v_hash;
END;
$fn$;

CREATE OR REPLACE FUNCTION verify_deletion_complete(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_request RECORD;
  v_evidence_summary JSONB;
  v_all_complete BOOLEAN;
BEGIN
  SELECT * INTO v_request FROM winter_rtbf_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found: %', p_request_id; END IF;

  SELECT
    bool_and(status IN ('completed', 'skipped')),
    jsonb_agg(jsonb_build_object('table', table_name, 'status', status, 'deleted', records_deleted))
  INTO v_all_complete, v_evidence_summary
  FROM winter_rtbf_evidence WHERE request_id = p_request_id;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'subject_id', v_request.subject_id,
    'status', v_request.status,
    'verified', COALESCE(v_all_complete, false) AND v_request.status = 'completed',
    'verification_hash', v_request.verification_hash,
    'evidence', COALESCE(v_evidence_summary, '[]'::JSONB)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION export_deletion_evidence(p_request_id UUID, p_format TEXT DEFAULT 'json')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_request RECORD;
  v_evidence JSONB;
BEGIN
  SELECT * INTO v_request FROM winter_rtbf_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found: %', p_request_id; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', e.id, 'type', e.evidence_type, 'table', e.table_name,
    'records_deleted', e.records_deleted, 'status', e.status
  )) INTO v_evidence FROM winter_rtbf_evidence e WHERE e.request_id = p_request_id;

  UPDATE winter_rtbf_requests SET evidence_exported_at = NOW(), evidence_format = p_format WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'document_type', 'RTBF_DELETION_CERTIFICATE',
    'request_id', v_request.id,
    'subject_id', v_request.subject_id,
    'verification_hash', v_request.verification_hash,
    'evidence', COALESCE(v_evidence, '[]'::JSONB)
  );
END;
$fn$;

-- #############################################
-- PART 4: Verification view
-- #############################################

CREATE OR REPLACE VIEW winter_rtbf_verification_summary AS
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

GRANT SELECT ON winter_rtbf_verification_summary TO authenticated;

CREATE INDEX IF NOT EXISTS idx_rtbf_requests_verification
  ON winter_rtbf_requests(verification_hash) WHERE verification_hash IS NOT NULL;
