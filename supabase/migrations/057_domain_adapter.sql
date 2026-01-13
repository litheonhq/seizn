-- Migration: Domain Adapter
-- Tables for LoRA-style domain adaptation with feedback signals

-- Domain adapters for specialized retrieval
CREATE TABLE IF NOT EXISTS domain_adapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  domain_type TEXT,  -- e.g., 'legal', 'medical', 'technical'

  -- Adapter weights (LoRA-style low-rank matrices)
  adapter_rank INTEGER DEFAULT 8,  -- Low rank for efficiency
  weights_a JSONB,  -- Low-rank matrix A (embedding_dim x rank)
  weights_b JSONB,  -- Low-rank matrix B (rank x embedding_dim)
  scale FLOAT DEFAULT 1.0,

  -- Training state
  training_samples INTEGER DEFAULT 0,
  positive_samples INTEGER DEFAULT 0,
  negative_samples INTEGER DEFAULT 0,
  last_trained_at TIMESTAMPTZ,
  validation_mrr FLOAT,  -- Mean Reciprocal Rank

  status TEXT DEFAULT 'untrained' CHECK (status IN ('untrained', 'training', 'ready', 'stale')),
  auto_retrain BOOLEAN DEFAULT FALSE,
  retrain_threshold INTEGER DEFAULT 100,  -- Retrain after N new samples

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training signals for domain adaptation
CREATE TABLE IF NOT EXISTS adapter_training_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id UUID NOT NULL REFERENCES domain_adapters(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_embedding VECTOR(1536),

  -- Positive/negative document signals
  positive_doc_ids TEXT[],  -- Docs marked as relevant
  negative_doc_ids TEXT[],  -- Docs marked as irrelevant

  -- Click/dwell signals
  clicked_doc_ids TEXT[],
  dwell_times JSONB,  -- {doc_id: seconds}

  signal_type TEXT CHECK (signal_type IN ('explicit_feedback', 'click', 'dwell', 'conversion')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training runs history
CREATE TABLE IF NOT EXISTS adapter_training_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id UUID NOT NULL REFERENCES domain_adapters(id) ON DELETE CASCADE,

  -- Training config
  config JSONB NOT NULL DEFAULT '{
    "rank": 8,
    "scale": 1.0,
    "learningRate": 0.001,
    "epochs": 10,
    "batchSize": 32,
    "lossMargin": 0.5
  }',

  -- Progress
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'training', 'completed', 'failed', 'cancelled')),
  progress JSONB DEFAULT '{"currentEpoch": 0, "totalEpochs": 0, "currentStep": 0, "totalSteps": 0}',

  -- Results
  metrics JSONB DEFAULT '{"trainLoss": [], "validationLoss": [], "mrr": [], "ndcg": []}',
  final_mrr FLOAT,
  final_ndcg FLOAT,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_adapters_user ON domain_adapters(user_id);
CREATE INDEX idx_adapters_collection ON domain_adapters(collection_id);
CREATE INDEX idx_adapters_status ON domain_adapters(status);
CREATE INDEX idx_adapters_domain_type ON domain_adapters(domain_type);

CREATE INDEX idx_signals_adapter ON adapter_training_signals(adapter_id);
CREATE INDEX idx_signals_type ON adapter_training_signals(signal_type);
CREATE INDEX idx_signals_created ON adapter_training_signals(created_at DESC);

CREATE INDEX idx_training_runs_adapter ON adapter_training_runs(adapter_id);
CREATE INDEX idx_training_runs_status ON adapter_training_runs(status);

-- RLS Policies
ALTER TABLE domain_adapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE adapter_training_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE adapter_training_runs ENABLE ROW LEVEL SECURITY;

-- Adapter RLS
CREATE POLICY "Users own their adapters"
  ON domain_adapters
  FOR ALL
  USING (auth.uid() = user_id);

-- Signals RLS (via adapter ownership)
CREATE POLICY "Signals belong to user adapters"
  ON adapter_training_signals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM domain_adapters
      WHERE id = adapter_id AND user_id = auth.uid()
    )
  );

-- Training runs RLS (via adapter ownership)
CREATE POLICY "Training runs belong to user adapters"
  ON adapter_training_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM domain_adapters
      WHERE id = adapter_id AND user_id = auth.uid()
    )
  );

-- Helper function to increment signal count
CREATE OR REPLACE FUNCTION increment_adapter_signal_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE domain_adapters
  SET
    training_samples = training_samples + 1,
    positive_samples = CASE
      WHEN array_length(NEW.positive_doc_ids, 1) > 0 THEN positive_samples + 1
      ELSE positive_samples
    END,
    negative_samples = CASE
      WHEN array_length(NEW.negative_doc_ids, 1) > 0 THEN negative_samples + 1
      ELSE negative_samples
    END,
    status = CASE
      WHEN status = 'ready' AND auto_retrain = TRUE
           AND training_samples + 1 >= retrain_threshold
      THEN 'stale'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = NEW.adapter_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER adapter_signal_insert_trigger
  AFTER INSERT ON adapter_training_signals
  FOR EACH ROW
  EXECUTE FUNCTION increment_adapter_signal_count();

-- Helper function to decrement signal count on delete
CREATE OR REPLACE FUNCTION decrement_adapter_signal_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE domain_adapters
  SET
    training_samples = GREATEST(0, training_samples - 1),
    positive_samples = CASE
      WHEN array_length(OLD.positive_doc_ids, 1) > 0 THEN GREATEST(0, positive_samples - 1)
      ELSE positive_samples
    END,
    negative_samples = CASE
      WHEN array_length(OLD.negative_doc_ids, 1) > 0 THEN GREATEST(0, negative_samples - 1)
      ELSE negative_samples
    END,
    updated_at = NOW()
  WHERE id = OLD.adapter_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER adapter_signal_delete_trigger
  AFTER DELETE ON adapter_training_signals
  FOR EACH ROW
  EXECUTE FUNCTION decrement_adapter_signal_count();

-- Helper function to update adapter status on training completion
CREATE OR REPLACE FUNCTION update_adapter_on_training_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status = 'training' THEN
    UPDATE domain_adapters
    SET
      status = 'ready',
      validation_mrr = NEW.final_mrr,
      last_trained_at = NEW.completed_at,
      updated_at = NOW()
    WHERE id = NEW.adapter_id;
  ELSIF NEW.status = 'failed' AND OLD.status = 'training' THEN
    UPDATE domain_adapters
    SET
      status = CASE WHEN validation_mrr IS NOT NULL THEN 'ready' ELSE 'untrained' END,
      updated_at = NOW()
    WHERE id = NEW.adapter_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER adapter_training_status_trigger
  AFTER UPDATE ON adapter_training_runs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_adapter_on_training_complete();

-- Comments
COMMENT ON TABLE domain_adapters IS 'LoRA-style domain adapters for specialized retrieval tuning';
COMMENT ON TABLE adapter_training_signals IS 'Feedback signals for training domain adapters';
COMMENT ON TABLE adapter_training_runs IS 'Training run history for domain adapters';
COMMENT ON COLUMN domain_adapters.adapter_rank IS 'Rank of LoRA matrices (lower = fewer params, typically 4-16)';
COMMENT ON COLUMN domain_adapters.weights_a IS 'Low-rank matrix A: embedding_dim x rank';
COMMENT ON COLUMN domain_adapters.weights_b IS 'Low-rank matrix B: rank x embedding_dim';
COMMENT ON COLUMN domain_adapters.scale IS 'Scaling factor for adapter output (alpha in LoRA)';
