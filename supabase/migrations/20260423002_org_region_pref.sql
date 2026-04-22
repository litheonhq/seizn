-- Organization preferred data-residency metadata for Batch C persona seeding.
-- This is compliance posture only; actual Supabase region is set at project provisioning.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS preferred_region TEXT
    CHECK (preferred_region IN ('seoul', 'us-east-1', 'eu-west-1', 'auto') OR preferred_region IS NULL)
    DEFAULT 'auto';

CREATE INDEX IF NOT EXISTS idx_organizations_preferred_region
  ON public.organizations(preferred_region)
  WHERE preferred_region = 'seoul';

COMMENT ON COLUMN public.organizations.preferred_region IS
  'Compliance-posture metadata. Actual Supabase region is set at project provisioning. seoul = explicit KR-data-residency intent.';

CREATE OR REPLACE FUNCTION public.enforce_preferred_region_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.preferred_region IS NOT DISTINCT FROM OLD.preferred_region THEN
    RETURN NEW;
  END IF;

  -- Internal service-role writes are gated in API code before this update.
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = NEW.id
      AND om.user_id = auth.uid()::text
      AND om.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'preferred_region can only be changed by an organization owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_preferred_region_owner ON public.organizations;
CREATE TRIGGER trg_enforce_preferred_region_owner
  BEFORE UPDATE OF preferred_region ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_preferred_region_owner();

NOTIFY pgrst, 'reload schema';
