CREATE TABLE IF NOT EXISTS public.bug_tracker_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('linear', 'github', 'jira')),
  encrypted_token TEXT NOT NULL,
  webhook_secret_hash TEXT,
  default_project_key TEXT,
  base_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_tracker_integrations_studio_provider
  ON public.bug_tracker_integrations(studio_id, provider)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_bug_tracker_integrations_org_provider
  ON public.bug_tracker_integrations(organization_id, provider)
  WHERE active AND organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bug_tracker_integrations_default
  ON public.bug_tracker_integrations(studio_id, provider, (COALESCE(default_project_key, '')))
  WHERE active;

CREATE TABLE IF NOT EXISTS public.replay_bundle_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL REFERENCES public.replay_snapshots(trace_id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  bundle_hash TEXT NOT NULL,
  signed_url_expires_at TIMESTAMPTZ NOT NULL,
  provider TEXT CHECK (provider IN ('linear', 'github', 'jira')),
  external_issue_key TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replay_bundle_exports_trace_created
  ON public.replay_bundle_exports(trace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_replay_bundle_exports_org_created
  ON public.replay_bundle_exports(organization_id, created_at DESC);

ALTER TABLE public.bug_tracker_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replay_bundle_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages bug tracker integrations" ON public.bug_tracker_integrations;
CREATE POLICY "Service role manages bug tracker integrations"
  ON public.bug_tracker_integrations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view bug tracker integrations" ON public.bug_tracker_integrations;
CREATE POLICY "Org members can view bug tracker integrations"
  ON public.bug_tracker_integrations FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id::TEXT = auth.uid()::TEXT
    )
    OR studio_id = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Service role manages replay bundle exports" ON public.replay_bundle_exports;
CREATE POLICY "Service role manages replay bundle exports"
  ON public.replay_bundle_exports FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view replay bundle exports" ON public.replay_bundle_exports;
CREATE POLICY "Org members can view replay bundle exports"
  ON public.replay_bundle_exports FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id::TEXT = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.bug_tracker_integrations TO authenticated;
GRANT SELECT ON public.replay_bundle_exports TO authenticated;
GRANT ALL ON public.bug_tracker_integrations TO service_role;
GRANT ALL ON public.replay_bundle_exports TO service_role;
