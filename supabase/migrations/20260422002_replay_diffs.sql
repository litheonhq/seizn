CREATE TABLE IF NOT EXISTS public.replay_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.replay_snapshots(trace_id) ON DELETE CASCADE,
  replayed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  diff JSONB NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seed_match BOOLEAN NOT NULL,
  output_match BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replay_diffs_snapshot
  ON public.replay_diffs(snapshot_id, replayed_at DESC);

CREATE INDEX IF NOT EXISTS idx_replay_diffs_org_created
  ON public.replay_diffs(organization_id, created_at DESC);

ALTER TABLE public.replay_diffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages replay diffs" ON public.replay_diffs;
CREATE POLICY "Service role manages replay diffs"
  ON public.replay_diffs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users view own org replay diffs" ON public.replay_diffs;
CREATE POLICY "Users view own org replay diffs"
  ON public.replay_diffs FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id::TEXT = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.replay_diffs TO authenticated;
GRANT ALL ON public.replay_diffs TO service_role;

NOTIFY pgrst, 'reload schema';
