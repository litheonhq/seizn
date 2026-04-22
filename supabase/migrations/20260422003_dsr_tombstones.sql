CREATE TABLE IF NOT EXISTS public.dsr_deletion_tombstones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.dsr_jobs(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  certificate_hash TEXT NOT NULL,
  rows_deleted JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsr_tombstones_subject
  ON public.dsr_deletion_tombstones(organization_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_dsr_jobs_claimable
  ON public.dsr_jobs(created_at ASC)
  WHERE status IN ('pending', 'queued');

ALTER TABLE public.dsr_deletion_tombstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages tombstones" ON public.dsr_deletion_tombstones;
CREATE POLICY "Service role manages tombstones"
  ON public.dsr_deletion_tombstones FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users view own org tombstones" ON public.dsr_deletion_tombstones;
CREATE POLICY "Users view own org tombstones"
  ON public.dsr_deletion_tombstones FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = dsr_deletion_tombstones.organization_id
        AND om.user_id = auth.uid()::text
    )
  );

CREATE OR REPLACE FUNCTION public.claim_next_dsr_job()
RETURNS SETOF public.dsr_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  picked public.dsr_jobs%ROWTYPE;
BEGIN
  SELECT *
    INTO picked
    FROM public.dsr_jobs
   WHERE status IN ('pending', 'queued')
   ORDER BY created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.dsr_jobs
     SET status = CASE WHEN picked.status = 'queued' THEN 'processing' ELSE 'running' END
   WHERE id = picked.id
   RETURNING * INTO picked;

  RETURN NEXT picked;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_dsr_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_dsr_job() TO service_role;

NOTIFY pgrst, 'reload schema';
