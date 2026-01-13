-- Seizn Fall - Enhanced Evaluation Pipeline
-- Migration: 041_eval_pipeline.sql
-- Adds extended evaluation metrics support and dataset management

-- ===========================================
-- 1) Extend fall_eval_datasets
-- ===========================================

-- Add source column to track dataset origin
ALTER TABLE fall_eval_datasets
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Add case count for quick reference
ALTER TABLE fall_eval_datasets
  ADD COLUMN IF NOT EXISTS case_count INTEGER DEFAULT 0;

-- Add metadata column if not exists
ALTER TABLE fall_eval_datasets
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Create index for source filtering
CREATE INDEX IF NOT EXISTS idx_fall_eval_datasets_source
ON fall_eval_datasets(user_id, source);

-- ===========================================
-- 2) Extend fall_eval_cases
-- ===========================================

-- Add relevance_scores for graded relevance (NDCG)
ALTER TABLE fall_eval_cases
  ADD COLUMN IF NOT EXISTS relevance_scores FLOAT[] NULL;

-- Create index for faster case lookups
CREATE INDEX IF NOT EXISTS idx_fall_eval_cases_user_dataset
ON fall_eval_cases(user_id, dataset_id);

-- ===========================================
-- 3) Extend fall_eval_runs
-- ===========================================

-- Add duration tracking
ALTER TABLE fall_eval_runs
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER NULL;

-- ===========================================
-- 4) Extend fall_eval_results
-- ===========================================

-- Ensure debug column exists
ALTER TABLE fall_eval_results
  ADD COLUMN IF NOT EXISTS debug JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Create index for run results lookup
CREATE INDEX IF NOT EXISTS idx_fall_eval_results_case
ON fall_eval_results(case_id);

-- ===========================================
-- 5) Create regression events table
-- ===========================================

CREATE TABLE IF NOT EXISTS fall_eval_regression_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES fall_eval_datasets(id) ON DELETE CASCADE,

  baseline_run_id UUID NOT NULL REFERENCES fall_eval_runs(id) ON DELETE CASCADE,
  candidate_run_id UUID NOT NULL REFERENCES fall_eval_runs(id) ON DELETE CASCADE,

  metric_key TEXT NOT NULL,
  baseline_value FLOAT NOT NULL,
  candidate_value FLOAT NOT NULL,
  delta FLOAT NOT NULL,

  severity TEXT NOT NULL DEFAULT 'warning', -- warning|critical
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for regression events
CREATE INDEX IF NOT EXISTS idx_fall_eval_regression_events_user
ON fall_eval_regression_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_eval_regression_events_dataset
ON fall_eval_regression_events(dataset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_eval_regression_events_unack
ON fall_eval_regression_events(user_id, acknowledged) WHERE acknowledged = FALSE;

-- ===========================================
-- 6) Create eval reports table (optional)
-- ===========================================

CREATE TABLE IF NOT EXISTS fall_eval_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES fall_eval_runs(id) ON DELETE CASCADE,

  format TEXT NOT NULL DEFAULT 'json', -- json|csv|markdown|html
  title TEXT NULL,

  -- Store report configuration
  config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Comparison data if baseline was provided
  baseline_run_id UUID NULL REFERENCES fall_eval_runs(id) ON DELETE SET NULL,
  comparison_delta JSONB NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_eval_reports_run
ON fall_eval_reports(run_id);

CREATE INDEX IF NOT EXISTS idx_fall_eval_reports_user
ON fall_eval_reports(user_id, created_at DESC);

-- ===========================================
-- 7) RLS Policies
-- ===========================================

ALTER TABLE fall_eval_regression_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_eval_reports ENABLE ROW LEVEL SECURITY;

-- Regression events policies
CREATE POLICY "Users can view own fall_eval_regression_events"
  ON fall_eval_regression_events FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own fall_eval_regression_events"
  ON fall_eval_regression_events FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own fall_eval_regression_events"
  ON fall_eval_regression_events FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

-- Reports policies
CREATE POLICY "Users can view own fall_eval_reports"
  ON fall_eval_reports FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own fall_eval_reports"
  ON fall_eval_reports FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

-- ===========================================
-- 8) Helper function for dataset case count
-- ===========================================

CREATE OR REPLACE FUNCTION update_eval_dataset_case_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE fall_eval_datasets
    SET case_count = (
      SELECT COUNT(*) FROM fall_eval_cases
      WHERE dataset_id = NEW.dataset_id
    ),
    updated_at = NOW()
    WHERE id = NEW.dataset_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE fall_eval_datasets
    SET case_count = (
      SELECT COUNT(*) FROM fall_eval_cases
      WHERE dataset_id = OLD.dataset_id
    ),
    updated_at = NOW()
    WHERE id = OLD.dataset_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_update_eval_dataset_case_count ON fall_eval_cases;

CREATE TRIGGER trg_update_eval_dataset_case_count
AFTER INSERT OR DELETE ON fall_eval_cases
FOR EACH ROW
EXECUTE FUNCTION update_eval_dataset_case_count();

-- ===========================================
-- 9) Backfill existing datasets with case counts
-- ===========================================

UPDATE fall_eval_datasets d
SET case_count = (
  SELECT COUNT(*) FROM fall_eval_cases c
  WHERE c.dataset_id = d.id
)
WHERE case_count IS NULL OR case_count = 0;
