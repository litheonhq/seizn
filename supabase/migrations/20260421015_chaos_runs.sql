-- 20260421015_chaos_runs.sql
-- NPC Chaos Monkey adversarial simulation runs and findings.

CREATE TABLE IF NOT EXISTS public.chaos_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  npc_id TEXT NOT NULL,
  suite TEXT NOT NULL DEFAULT 'basic',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  prompt_count INTEGER NOT NULL DEFAULT 100
    CHECK (prompt_count > 0 AND prompt_count <= 5000),
  target_endpoint TEXT,
  target_mode TEXT NOT NULL DEFAULT 'seizn-hosted'
    CHECK (target_mode IN ('seizn-hosted', 'external')),
  progress_total INTEGER NOT NULL DEFAULT 0,
  progress_completed INTEGER NOT NULL DEFAULT 0,
  findings_count INTEGER NOT NULL DEFAULT 0,
  failure_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  cost_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chaos_runs_studio_created
  ON public.chaos_runs(studio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chaos_runs_status_created
  ON public.chaos_runs(status, created_at ASC)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_chaos_runs_studio_npc
  ON public.chaos_runs(studio_id, npc_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chaos_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.chaos_runs(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  npc_id TEXT NOT NULL,
  prompt_index INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  prompt_category TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('canon_violation', 'toxic_output', 'contradiction_loop', 'dead_end', 'jailbreak_leak', 'endpoint_error')),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  expected_behavior TEXT,
  actual_output TEXT,
  verdict JSONB NOT NULL DEFAULT '{}'::JSONB,
  replay_trace_id TEXT,
  replay_bundle_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chaos_findings_run
  ON public.chaos_findings(run_id, severity, category);

CREATE INDEX IF NOT EXISTS idx_chaos_findings_studio_created
  ON public.chaos_findings(studio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chaos_findings_replay_trace
  ON public.chaos_findings(replay_trace_id)
  WHERE replay_trace_id IS NOT NULL;

ALTER TABLE public.chaos_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chaos_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages chaos runs" ON public.chaos_runs;
CREATE POLICY "Service role manages chaos runs"
  ON public.chaos_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view chaos runs" ON public.chaos_runs;
CREATE POLICY "Org members can view chaos runs"
  ON public.chaos_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = chaos_runs.studio_id
        AND om.user_id = auth.uid()::TEXT
    )
  );

DROP POLICY IF EXISTS "Service role manages chaos findings" ON public.chaos_findings;
CREATE POLICY "Service role manages chaos findings"
  ON public.chaos_findings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view chaos findings" ON public.chaos_findings;
CREATE POLICY "Org members can view chaos findings"
  ON public.chaos_findings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = chaos_findings.studio_id
        AND om.user_id = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.chaos_runs TO authenticated;
GRANT SELECT ON public.chaos_findings TO authenticated;
GRANT ALL ON public.chaos_runs TO service_role;
GRANT ALL ON public.chaos_findings TO service_role;

COMMENT ON TABLE public.chaos_runs IS
  'NPC Chaos Monkey adversarial simulation runs grouped by studio and NPC.';
COMMENT ON TABLE public.chaos_findings IS
  'Grouped failures produced by Chaos Monkey prompts, linked to replay traces when available.';

NOTIFY pgrst, 'reload schema';
