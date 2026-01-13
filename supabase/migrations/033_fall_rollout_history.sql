-- Fall Rollout History for A/B Testing Winner Rollout
-- Tracks gradual rollout stages for experiment winners

CREATE TABLE IF NOT EXISTS fall_rollout_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES fall_experiments(id) ON DELETE CASCADE,
  winner_arm_id UUID NOT NULL REFERENCES fall_experiment_arms(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('candidate', '10%', '50%', '100%', 'completed')),
  weights JSONB NOT NULL DEFAULT '{}',
  executed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_fall_rollout_history_experiment ON fall_rollout_history(experiment_id);
CREATE INDEX idx_fall_rollout_history_created ON fall_rollout_history(created_at DESC);

-- RLS policies
ALTER TABLE fall_rollout_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rollout history"
  ON fall_rollout_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fall_experiments e
      WHERE e.id = fall_rollout_history.experiment_id
      AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert rollout history for their experiments"
  ON fall_rollout_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fall_experiments e
      WHERE e.id = fall_rollout_history.experiment_id
      AND e.user_id = auth.uid()
    )
  );

-- Add guardrail_config column to fall_experiments for storing custom guardrail settings
ALTER TABLE fall_experiments
ADD COLUMN IF NOT EXISTS guardrail_config JSONB DEFAULT '{
  "minSampleSize": 100,
  "minDurationHours": 24,
  "maxDurationDays": 30,
  "srmThreshold": 0.01,
  "significanceLevel": 0.05,
  "minUplift": 0.05,
  "enableAutoStop": false
}'::JSONB;

-- Add winner_arm_id column to track declared winner
ALTER TABLE fall_experiments
ADD COLUMN IF NOT EXISTS winner_arm_id UUID REFERENCES fall_experiment_arms(id);

-- Add rollout_stage column to track current rollout progress
ALTER TABLE fall_experiments
ADD COLUMN IF NOT EXISTS rollout_stage TEXT CHECK (rollout_stage IS NULL OR rollout_stage IN ('candidate', '10%', '50%', '100%', 'completed'));

COMMENT ON TABLE fall_rollout_history IS 'History of gradual rollout stages for A/B test winners';
COMMENT ON COLUMN fall_experiments.guardrail_config IS 'Custom guardrail configuration for experiment';
COMMENT ON COLUMN fall_experiments.winner_arm_id IS 'Declared winner arm (set after statistical significance)';
COMMENT ON COLUMN fall_experiments.rollout_stage IS 'Current rollout stage for winner promotion';
