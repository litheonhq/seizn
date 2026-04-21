-- 20260421020_import_jobs.sql
-- Competitor import jobs for Inworld, Convai, and Rivet migration wizard.

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('inworld', 'convai', 'rivet')),
  status TEXT NOT NULL DEFAULT 'previewed'
    CHECK (status IN ('previewed', 'committed', 'rolled_back', 'failed')),
  filename TEXT,
  source_hash TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  raw_stats JSONB NOT NULL DEFAULT '{}'::JSONB,
  inserted_memory_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  inserted_canon_lock_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  inserted_belief_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  error_message TEXT,
  committed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_org_created
  ON public.import_jobs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_user_created
  ON public.import_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status
  ON public.import_jobs(organization_id, status, created_at DESC);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages import jobs" ON public.import_jobs;
CREATE POLICY "Service role manages import jobs"
  ON public.import_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view import jobs" ON public.import_jobs;
CREATE POLICY "Org members can view import jobs"
  ON public.import_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = import_jobs.organization_id
        AND om.user_id::TEXT = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

COMMENT ON TABLE public.import_jobs IS
  'Preview, commit, and rollback state for competitor exports imported into Seizn.';
COMMENT ON COLUMN public.import_jobs.normalized_payload IS
  'Canonical Seizn memory, canon lock, and belief shard payload derived from the uploaded competitor export.';
COMMENT ON COLUMN public.import_jobs.inserted_memory_ids IS
  'Memory row ids created by the commit step and soft-deleted during rollback.';

NOTIFY pgrst, 'reload schema';
