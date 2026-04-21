CREATE TABLE IF NOT EXISTS public.design_partner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id TEXT,
  user_id TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  website TEXT,
  game_title TEXT,
  team_size TEXT,
  live_title BOOLEAN NOT NULL DEFAULT FALSE,
  use_case TEXT NOT NULL,
  expected_memory_volume TEXT,
  feedback_commitment BOOLEAN NOT NULL DEFAULT FALSE,
  case_study_commitment BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'converted', 'withdrawn')),
  coupon_code TEXT NOT NULL DEFAULT 'SEIZN_DP_2026',
  stripe_customer_id TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  approved_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_partner_applications_email
  ON public.design_partner_applications(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_design_partner_applications_status_created
  ON public.design_partner_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_design_partner_applications_studio
  ON public.design_partner_applications(studio_id)
  WHERE studio_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.design_partner_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.design_partner_applications(id) ON DELETE SET NULL,
  studio_id TEXT NOT NULL,
  user_id TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  coupon_code TEXT NOT NULL DEFAULT 'SEIZN_DP_2026',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  next_feedback_due_at TIMESTAMPTZ,
  case_study_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (case_study_status IN ('pending', 'scheduled', 'published', 'waived')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_partner_relationships_studio
  ON public.design_partner_relationships(studio_id);

CREATE INDEX IF NOT EXISTS idx_design_partner_relationships_status
  ON public.design_partner_relationships(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_design_partner_relationships_active_studio
  ON public.design_partner_relationships(studio_id)
  WHERE status = 'active';

ALTER TABLE public.design_partner_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_partner_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages design partner applications" ON public.design_partner_applications;
CREATE POLICY "Service role manages design partner applications"
  ON public.design_partner_applications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own design partner applications" ON public.design_partner_applications;
CREATE POLICY "Users can view own design partner applications"
  ON public.design_partner_applications FOR SELECT
  USING (
    user_id = auth.uid()::TEXT
    OR studio_id = auth.uid()::TEXT
    OR organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id::TEXT = auth.uid()::TEXT
    )
  );

DROP POLICY IF EXISTS "Service role manages design partner relationships" ON public.design_partner_relationships;
CREATE POLICY "Service role manages design partner relationships"
  ON public.design_partner_relationships FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own design partner relationships" ON public.design_partner_relationships;
CREATE POLICY "Users can view own design partner relationships"
  ON public.design_partner_relationships FOR SELECT
  USING (
    user_id = auth.uid()::TEXT
    OR studio_id = auth.uid()::TEXT
    OR organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id::TEXT = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.design_partner_applications TO authenticated;
GRANT SELECT ON public.design_partner_relationships TO authenticated;
GRANT ALL ON public.design_partner_applications TO service_role;
GRANT ALL ON public.design_partner_relationships TO service_role;
