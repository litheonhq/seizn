-- Migration: Summer Reranker Training
-- Tables for reranker dataset management, training, and deployment

-- Training datasets
CREATE TABLE IF NOT EXISTS summer_reranker_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  collection_id UUID REFERENCES summer_collections(id) ON DELETE SET NULL,
  sample_count INTEGER DEFAULT 0,
  split_ratio JSONB DEFAULT '{"train": 0.8, "validation": 0.1, "test": 0.1}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Training samples
CREATE TABLE IF NOT EXISTS summer_reranker_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES summer_reranker_datasets(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  positive_doc TEXT NOT NULL,
  negative_doc TEXT NOT NULL,
  positive_score FLOAT DEFAULT 1.0,
  negative_score FLOAT DEFAULT 0.0,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'click', 'feedback', 'synthetic')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Training runs
CREATE TABLE IF NOT EXISTS summer_reranker_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES summer_reranker_datasets(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'training', 'completed', 'failed', 'cancelled')),
  progress JSONB DEFAULT '{"currentEpoch": 0, "currentStep": 0, "totalSteps": 0, "percentComplete": 0}',
  metrics JSONB DEFAULT '{"trainLoss": [], "validationLoss": [], "mrr": [], "ndcg": [], "map": [], "bestEpoch": 0, "bestMRR": 0, "bestNDCG": 0}',
  checkpoints JSONB DEFAULT '[]',
  logs JSONB DEFAULT '[]',
  webhook_url TEXT,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Deployed models
CREATE TABLE IF NOT EXISTS summer_reranker_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  run_id UUID NOT NULL REFERENCES summer_reranker_runs(id) ON DELETE CASCADE,
  checkpoint_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'deploying' CHECK (status IN ('deploying', 'active', 'inactive', 'failed')),
  endpoint TEXT,
  config JSONB DEFAULT '{"maxBatchSize": 32, "timeout": 5000, "cacheEnabled": true}',
  metrics JSONB DEFAULT '{"totalRequests": 0, "avgLatencyMs": 0, "errorRate": 0}',
  deployed_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- Model evaluations
CREATE TABLE IF NOT EXISTS summer_reranker_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES summer_reranker_models(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES summer_reranker_datasets(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL,
  latency JSONB NOT NULL,
  evaluated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reranker_datasets_user ON summer_reranker_datasets(user_id);
CREATE INDEX idx_reranker_samples_dataset ON summer_reranker_samples(dataset_id);
CREATE INDEX idx_reranker_samples_source ON summer_reranker_samples(source);
CREATE INDEX idx_reranker_runs_dataset ON summer_reranker_runs(dataset_id);
CREATE INDEX idx_reranker_runs_status ON summer_reranker_runs(status);
CREATE INDEX idx_reranker_models_user ON summer_reranker_models(user_id);
CREATE INDEX idx_reranker_models_status ON summer_reranker_models(status);
CREATE INDEX idx_reranker_evaluations_model ON summer_reranker_evaluations(model_id);

-- RLS Policies
ALTER TABLE summer_reranker_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_reranker_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_reranker_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_reranker_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_reranker_evaluations ENABLE ROW LEVEL SECURITY;

-- Dataset RLS
CREATE POLICY "Users can view their datasets"
  ON summer_reranker_datasets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their datasets"
  ON summer_reranker_datasets FOR ALL
  USING (user_id = auth.uid());

-- Samples RLS (via dataset ownership)
CREATE POLICY "Users can view samples in their datasets"
  ON summer_reranker_samples FOR SELECT
  USING (
    dataset_id IN (
      SELECT id FROM summer_reranker_datasets WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage samples in their datasets"
  ON summer_reranker_samples FOR ALL
  USING (
    dataset_id IN (
      SELECT id FROM summer_reranker_datasets WHERE user_id = auth.uid()
    )
  );

-- Runs RLS (via dataset ownership)
CREATE POLICY "Users can view runs for their datasets"
  ON summer_reranker_runs FOR SELECT
  USING (
    dataset_id IN (
      SELECT id FROM summer_reranker_datasets WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage runs for their datasets"
  ON summer_reranker_runs FOR ALL
  USING (
    dataset_id IN (
      SELECT id FROM summer_reranker_datasets WHERE user_id = auth.uid()
    )
  );

-- Models RLS
CREATE POLICY "Users can view their models"
  ON summer_reranker_models FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their models"
  ON summer_reranker_models FOR ALL
  USING (user_id = auth.uid());

-- Evaluations RLS (via model ownership)
CREATE POLICY "Users can view evaluations for their models"
  ON summer_reranker_evaluations FOR SELECT
  USING (
    model_id IN (
      SELECT id FROM summer_reranker_models WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage evaluations for their models"
  ON summer_reranker_evaluations FOR ALL
  USING (
    model_id IN (
      SELECT id FROM summer_reranker_models WHERE user_id = auth.uid()
    )
  );

-- Helper function to increment sample count
CREATE OR REPLACE FUNCTION increment_dataset_sample_count(p_dataset_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE summer_reranker_datasets
  SET sample_count = sample_count + 1,
      updated_at = now()
  WHERE id = p_dataset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get sample count
CREATE OR REPLACE FUNCTION get_dataset_sample_count(p_dataset_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM summer_reranker_samples
  WHERE dataset_id = p_dataset_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update dataset sample count on delete
CREATE OR REPLACE FUNCTION update_dataset_sample_count_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE summer_reranker_datasets
  SET sample_count = sample_count - 1,
      updated_at = now()
  WHERE id = OLD.dataset_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER summer_reranker_sample_delete_trigger
  AFTER DELETE ON summer_reranker_samples
  FOR EACH ROW
  EXECUTE FUNCTION update_dataset_sample_count_on_delete();

COMMENT ON TABLE summer_reranker_datasets IS 'Training datasets for reranker models';
COMMENT ON TABLE summer_reranker_samples IS 'Training samples with query-positive-negative triplets';
COMMENT ON TABLE summer_reranker_runs IS 'Training run history with progress and metrics';
COMMENT ON TABLE summer_reranker_models IS 'Deployed reranker model versions';
COMMENT ON TABLE summer_reranker_evaluations IS 'Model evaluation results on datasets';
