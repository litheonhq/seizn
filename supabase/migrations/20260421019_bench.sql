-- 20260421019_bench.sql
-- Public benchmark leaderboard runs and per-system task results.

CREATE TABLE IF NOT EXISTS public.bench_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key TEXT NOT NULL UNIQUE,
  suite_version TEXT NOT NULL DEFAULT '2026-04',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  source TEXT NOT NULL DEFAULT 'weekly-bench',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  raw_csv TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bench_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.bench_runs(id) ON DELETE CASCADE,
  system TEXT NOT NULL,
  task TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  rank INTEGER NOT NULL CHECK (rank > 0),
  verdict TEXT NOT NULL DEFAULT 'neutral'
    CHECK (verdict IN ('win', 'competitive', 'loss', 'neutral')),
  raw JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, system, task)
);

CREATE INDEX IF NOT EXISTS idx_bench_runs_completed
  ON public.bench_runs(completed_at DESC)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_bench_results_run_rank
  ON public.bench_results(run_id, task, rank);

CREATE INDEX IF NOT EXISTS idx_bench_results_system
  ON public.bench_results(system, task);

ALTER TABLE public.bench_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bench_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view completed benchmark runs" ON public.bench_runs;
CREATE POLICY "Anyone can view completed benchmark runs"
  ON public.bench_runs FOR SELECT
  USING (status = 'completed');

DROP POLICY IF EXISTS "Anyone can view completed benchmark results" ON public.bench_results;
CREATE POLICY "Anyone can view completed benchmark results"
  ON public.bench_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bench_runs br
      WHERE br.id = bench_results.run_id
        AND br.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "Service role manages benchmark runs" ON public.bench_runs;
CREATE POLICY "Service role manages benchmark runs"
  ON public.bench_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages benchmark results" ON public.bench_results;
CREATE POLICY "Service role manages benchmark results"
  ON public.bench_results FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.bench_runs TO anon, authenticated;
GRANT SELECT ON public.bench_results TO anon, authenticated;
GRANT ALL ON public.bench_runs TO service_role;
GRANT ALL ON public.bench_results TO service_role;

COMMENT ON TABLE public.bench_runs IS
  'Public weekly benchmark runs comparing Seizn with memory infrastructure alternatives.';
COMMENT ON TABLE public.bench_results IS
  'Per-system, per-task benchmark metrics, scores, ranks, and raw methodology details.';

NOTIFY pgrst, 'reload schema';
