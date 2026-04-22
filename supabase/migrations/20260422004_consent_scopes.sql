ALTER TABLE public.consent_records
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS policy_version TEXT NOT NULL DEFAULT '2026-04-01',
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_consent_active
  ON public.consent_records(organization_id, subject_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_consent_scopes
  ON public.consent_records USING GIN(scopes);

NOTIFY pgrst, 'reload schema';
