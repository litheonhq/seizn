-- Seizn Fall - Evaluation + Experiments (A/B, Bandit)
-- Migration: 023_fall_eval_experiments.sql

-- ===========================================
-- 1) Evaluation datasets
-- ===========================================
CREATE TABLE IF NOT EXISTS fall_eval_datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_eval_datasets_user
ON fall_eval_datasets(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fall_eval_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES fall_eval_datasets(id) ON DELETE CASCADE,

  query_text TEXT NOT NULL,

  -- Optional labels for deterministic metrics
  expected_chunk_ids UUID[] NULL,
  expected_answer TEXT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_eval_cases_dataset
ON fall_eval_cases(dataset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fall_eval_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES fall_eval_datasets(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'running', -- running|success|failed
  config JSONB NOT NULL DEFAULT '{}'::JSONB,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,

  summary_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  error TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_fall_eval_runs_dataset
ON fall_eval_runs(dataset_id, started_at DESC);

CREATE TABLE IF NOT EXISTS fall_eval_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES fall_eval_runs(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES fall_eval_cases(id) ON DELETE CASCADE,

  retrieved_chunk_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  debug JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_eval_results_run
ON fall_eval_results(run_id, created_at DESC);

-- ===========================================
-- 2) Experiments (A/B & Bandit)
-- ===========================================
CREATE TABLE IF NOT EXISTS fall_experiments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'draft', -- draft|running|stopped
  allocation_strategy TEXT NOT NULL DEFAULT 'ab', -- ab|bandit
  unit TEXT NOT NULL DEFAULT 'user', -- user|api_key|session

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_experiments_user
ON fall_experiments(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fall_experiment_arms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID NOT NULL REFERENCES fall_experiments(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  weight FLOAT NOT NULL DEFAULT 0.5, -- used for ab allocation
  config_override JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_experiment_arms_experiment
ON fall_experiment_arms(experiment_id);

CREATE TABLE IF NOT EXISTS fall_exposures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  experiment_id UUID NOT NULL REFERENCES fall_experiments(id) ON DELETE CASCADE,
  arm_id UUID NOT NULL REFERENCES fall_experiment_arms(id) ON DELETE CASCADE,

  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  api_key_id UUID NULL REFERENCES api_keys(id) ON DELETE SET NULL,

  trace_id UUID NULL REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,
  request_id UUID NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_exposures_experiment_created
ON fall_exposures(experiment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fall_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  experiment_id UUID NOT NULL REFERENCES fall_experiments(id) ON DELETE CASCADE,
  arm_id UUID NOT NULL REFERENCES fall_experiment_arms(id) ON DELETE CASCADE,

  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  trace_id UUID NULL REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,
  request_id UUID NULL,

  event_type TEXT NOT NULL, -- click|accept|thumb_up|thumb_down|etc
  value FLOAT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_outcomes_experiment_created
ON fall_outcomes(experiment_id, created_at DESC);

-- Link experiment/arm onto traces for easier joins
ALTER TABLE fall_retrieval_traces
  ADD COLUMN IF NOT EXISTS experiment_id UUID NULL REFERENCES fall_experiments(id) ON DELETE SET NULL;

ALTER TABLE fall_retrieval_traces
  ADD COLUMN IF NOT EXISTS arm_id UUID NULL REFERENCES fall_experiment_arms(id) ON DELETE SET NULL;

-- ===========================================
-- 3) RLS
-- ===========================================
ALTER TABLE fall_eval_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_eval_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_eval_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE fall_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_experiment_arms ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_exposures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_outcomes ENABLE ROW LEVEL SECURITY;

-- Eval
CREATE POLICY "Users can view own fall_eval_datasets"
  ON fall_eval_datasets FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own fall_eval_datasets"
  ON fall_eval_datasets FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can update own fall_eval_datasets"
  ON fall_eval_datasets FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view own fall_eval_cases"
  ON fall_eval_cases FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own fall_eval_cases"
  ON fall_eval_cases FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view own fall_eval_runs"
  ON fall_eval_runs FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own fall_eval_runs"
  ON fall_eval_runs FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can update own fall_eval_runs"
  ON fall_eval_runs FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view own fall_eval_results"
  ON fall_eval_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fall_eval_runs r
      WHERE r.id = fall_eval_results.run_id AND r.user_id = auth.uid()::TEXT
    )
  );

-- Experiments
CREATE POLICY "Users can view own fall_experiments"
  ON fall_experiments FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own fall_experiments"
  ON fall_experiments FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can update own fall_experiments"
  ON fall_experiments FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view experiment arms of own experiments"
  ON fall_experiment_arms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fall_experiments e
      WHERE e.id = fall_experiment_arms.experiment_id AND e.user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY "Users can insert experiment arms of own experiments"
  ON fall_experiment_arms FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fall_experiments e
      WHERE e.id = fall_experiment_arms.experiment_id AND e.user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY "Users can view own fall_exposures"
  ON fall_exposures FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own fall_exposures"
  ON fall_exposures FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view own fall_outcomes"
  ON fall_outcomes FOR SELECT
  USING (auth.uid()::TEXT = user_id);
CREATE POLICY "Users can insert own fall_outcomes"
  ON fall_outcomes FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);
