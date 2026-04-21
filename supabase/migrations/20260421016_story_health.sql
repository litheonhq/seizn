-- 20260421016_story_health.sql
-- Daily narrative observability snapshots for NPC story health.

CREATE TABLE IF NOT EXISTS public.story_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  act TEXT NOT NULL DEFAULT 'global',
  snapshot_date DATE NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  trust_drift NUMERIC(12,4) NOT NULL DEFAULT 0,
  dialogue_entropy NUMERIC(12,4) NOT NULL DEFAULT 0,
  canon_violation_density NUMERIC(12,4) NOT NULL DEFAULT 0,
  contradiction_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  engagement_proxy NUMERIC(12,4) NOT NULL DEFAULT 0,
  narrative_consistency_score NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (narrative_consistency_score >= 0 AND narrative_consistency_score <= 100),
  session_count INTEGER NOT NULL DEFAULT 0,
  memory_count INTEGER NOT NULL DEFAULT 0,
  canon_violation_count INTEGER NOT NULL DEFAULT 0,
  confusion_report_count INTEGER NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  replay_trace_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  drilldowns JSONB NOT NULL DEFAULT '{}'::JSONB,
  judge_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (studio_id, act, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_story_health_snapshots_studio_date
  ON public.story_health_snapshots(studio_id, snapshot_date DESC, act);

CREATE INDEX IF NOT EXISTS idx_story_health_snapshots_consistency
  ON public.story_health_snapshots(studio_id, narrative_consistency_score ASC, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_story_health_snapshots_replay_trace_ids
  ON public.story_health_snapshots USING GIN(replay_trace_ids);

DROP MATERIALIZED VIEW IF EXISTS public.story_health_daily;
CREATE MATERIALIZED VIEW public.story_health_daily AS
SELECT
  studio_id,
  snapshot_date,
  act,
  AVG(trust_drift)::NUMERIC(12,4) AS trust_drift,
  AVG(dialogue_entropy)::NUMERIC(12,4) AS dialogue_entropy,
  AVG(canon_violation_density)::NUMERIC(12,4) AS canon_violation_density,
  AVG(contradiction_rate)::NUMERIC(12,4) AS contradiction_rate,
  AVG(engagement_proxy)::NUMERIC(12,4) AS engagement_proxy,
  AVG(narrative_consistency_score)::NUMERIC(5,2) AS narrative_consistency_score,
  SUM(session_count)::INTEGER AS session_count,
  SUM(memory_count)::INTEGER AS memory_count,
  SUM(canon_violation_count)::INTEGER AS canon_violation_count,
  SUM(confusion_report_count)::INTEGER AS confusion_report_count,
  SUM(contradiction_count)::INTEGER AS contradiction_count,
  MAX(updated_at) AS updated_at
FROM public.story_health_snapshots
GROUP BY studio_id, snapshot_date, act
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_health_daily_unique
  ON public.story_health_daily(studio_id, snapshot_date, act);

CREATE OR REPLACE FUNCTION public.refresh_story_health_daily()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.story_health_daily;
END;
$$;

ALTER TABLE public.story_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages story health snapshots" ON public.story_health_snapshots;
CREATE POLICY "Service role manages story health snapshots"
  ON public.story_health_snapshots FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view story health snapshots" ON public.story_health_snapshots;
CREATE POLICY "Org members can view story health snapshots"
  ON public.story_health_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = story_health_snapshots.studio_id
        AND om.user_id = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.story_health_snapshots TO authenticated;
GRANT ALL ON public.story_health_snapshots TO service_role;
GRANT SELECT ON public.story_health_daily TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_story_health_daily() TO service_role;

COMMENT ON TABLE public.story_health_snapshots IS
  'Daily per-act narrative observability snapshots derived from replay, memory, canon, chaos, and bug-report signals.';

COMMENT ON MATERIALIZED VIEW public.story_health_daily IS
  'Per-day materialized aggregate for story health dashboard reads.';

NOTIFY pgrst, 'reload schema';
