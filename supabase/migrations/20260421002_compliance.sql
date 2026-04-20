-- Seizn memory compliance primitives
-- Workstream B: DSR export/delete jobs, consent records, and subject-keyed memory retention.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS subject_id TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_org_subject
  ON public.memories (organization_id, subject_id, created_at DESC)
  WHERE subject_id IS NOT NULL;

ALTER TABLE public.fall_retrieval_traces
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject_id TEXT;

CREATE INDEX IF NOT EXISTS idx_fall_traces_org_subject
  ON public.fall_retrieval_traces (organization_id, subject_id, created_at DESC)
  WHERE organization_id IS NOT NULL AND subject_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  bracket TEXT NOT NULL CHECK (bracket IN ('unknown', 'minor_under_13', 'minor_13_17', 'adult')),
  parent_proof TEXT,
  granted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, subject_id, bracket)
);

CREATE INDEX IF NOT EXISTS idx_consent_records_subject
  ON public.consent_records (organization_id, subject_id, bracket);

CREATE INDEX IF NOT EXISTS idx_consent_records_active
  ON public.consent_records (organization_id, subject_id, bracket, granted_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.dsr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('export', 'delete')),
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  reason TEXT,
  artifact_url TEXT,
  artifact JSONB,
  certificate JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dsr_jobs_org_created
  ON public.dsr_jobs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dsr_jobs_subject_created
  ON public.dsr_jobs (organization_id, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_action_created
  ON public.audit_logs (organization_id, action, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_subject_details
  ON public.audit_logs ((details->>'subject_id'), created_at DESC)
  WHERE details ? 'subject_id';

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsr_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_records_org_members_read ON public.consent_records;
CREATE POLICY consent_records_org_members_read
  ON public.consent_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = consent_records.organization_id
        AND om.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS consent_records_org_admins_manage ON public.consent_records;
CREATE POLICY consent_records_org_admins_manage
  ON public.consent_records FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = consent_records.organization_id
        AND om.user_id = auth.uid()::text
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = consent_records.organization_id
        AND om.user_id = auth.uid()::text
        AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS dsr_jobs_org_members_read ON public.dsr_jobs;
CREATE POLICY dsr_jobs_org_members_read
  ON public.dsr_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = dsr_jobs.organization_id
        AND om.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS dsr_jobs_org_admins_manage ON public.dsr_jobs;
CREATE POLICY dsr_jobs_org_admins_manage
  ON public.dsr_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = dsr_jobs.organization_id
        AND om.user_id = auth.uid()::text
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = dsr_jobs.organization_id
        AND om.user_id = auth.uid()::text
        AND om.role IN ('owner', 'admin')
    )
  );

COMMENT ON COLUMN public.memories.subject_id IS
  'Customer-supplied end-user/player identifier used for DSR export, deletion, and age-gated retention.';

COMMENT ON TABLE public.consent_records IS
  'Organization-scoped COPPA/GDPR-K consent records for subject-keyed memory retention.';

COMMENT ON TABLE public.dsr_jobs IS
  'Data subject request jobs for export and verifiable deletion.';

NOTIFY pgrst, 'reload schema';
