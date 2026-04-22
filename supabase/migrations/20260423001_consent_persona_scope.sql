-- No new tables; consent_records.scopes is already TEXT[].
-- This migration adds a lookup index for the persona_seeding consent scope.

CREATE INDEX IF NOT EXISTS idx_consent_persona_scope
  ON public.consent_records(organization_id, subject_id)
  WHERE 'persona_seeding' = ANY(scopes) AND revoked_at IS NULL;

NOTIFY pgrst, 'reload schema';
