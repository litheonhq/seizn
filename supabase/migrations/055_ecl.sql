-- ============================================
-- Migration: 055_ecl.sql
-- ECL (Embedding Compatibility Layer)
-- Enables switching embedding models without full reindexing
-- by learning a translation layer between vector spaces
-- ============================================

-- ============================================
-- ECL Translation Models Table
-- Stores learned transformations between embedding spaces
-- ============================================
CREATE TABLE IF NOT EXISTS ecl_translation_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Source and target embedding models
  source_model VARCHAR(100) NOT NULL,  -- e.g., 'text-embedding-ada-002'
  target_model VARCHAR(100) NOT NULL,  -- e.g., 'text-embedding-3-large'
  source_dim INTEGER NOT NULL,         -- e.g., 1536 for ada-002
  target_dim INTEGER NOT NULL,         -- e.g., 3072 for 3-large

  -- Translation configuration
  translation_type VARCHAR(20) DEFAULT 'linear'
    CHECK (translation_type IN ('linear', 'affine', 'mlp')),

  -- Learned parameters (stored as JSONB for flexibility)
  -- For linear: weights is a (source_dim x target_dim) matrix
  -- For affine: additionally includes bias vector (target_dim)
  weights JSONB,
  bias JSONB,

  -- Training statistics
  training_samples INTEGER DEFAULT 0,
  validation_rmse FLOAT,
  training_config JSONB DEFAULT '{}'::jsonb,  -- regularization, learning params

  -- Quality metrics
  validation_r2 FLOAT,  -- R-squared correlation
  cosine_similarity_mean FLOAT,  -- Average cosine similarity on validation set

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'training', 'ready', 'failed', 'archived')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  trained_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ecl_models_user_id ON ecl_translation_models(user_id);
CREATE INDEX IF NOT EXISTS idx_ecl_models_status ON ecl_translation_models(status);
CREATE INDEX IF NOT EXISTS idx_ecl_models_source_target
  ON ecl_translation_models(source_model, target_model);
CREATE INDEX IF NOT EXISTS idx_ecl_models_created_at ON ecl_translation_models(created_at DESC);

-- Unique constraint: one model per user/source/target combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecl_models_unique_pair
  ON ecl_translation_models(user_id, source_model, target_model)
  WHERE status != 'archived';

-- ============================================
-- ECL Training Pairs Table
-- Stores vector pairs for learning translation
-- ============================================
CREATE TABLE IF NOT EXISTS ecl_training_pairs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES ecl_translation_models(id) ON DELETE CASCADE,

  -- Embedding pairs
  source_vector VECTOR,  -- Original embedding (source model)
  target_vector VECTOR,  -- New embedding (target model)

  -- Text reference for deduplication
  text_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash of source text
  text_preview VARCHAR(200),       -- First 200 chars for debugging

  -- Metadata
  is_validation BOOLEAN DEFAULT false,  -- true = validation set, false = training set
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ecl_pairs_model_id ON ecl_training_pairs(model_id);
CREATE INDEX IF NOT EXISTS idx_ecl_pairs_text_hash ON ecl_training_pairs(model_id, text_hash);
CREATE INDEX IF NOT EXISTS idx_ecl_pairs_validation ON ecl_training_pairs(model_id, is_validation);

-- Prevent duplicate text entries per model
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecl_pairs_unique_text
  ON ecl_training_pairs(model_id, text_hash);

-- ============================================
-- ECL Translation Jobs Table
-- Tracks background translation jobs
-- ============================================
CREATE TABLE IF NOT EXISTS ecl_translation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES ecl_translation_models(id) ON DELETE CASCADE,

  -- Job type and scope
  job_type VARCHAR(30) NOT NULL DEFAULT 'translate_collection'
    CHECK (job_type IN ('translate_collection', 'translate_memories', 'batch_translate')),
  target_collection_id UUID,  -- For collection translations

  -- Progress tracking
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  failed_item_ids JSONB DEFAULT '[]'::jsonb,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ecl_jobs_user_id ON ecl_translation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_ecl_jobs_model_id ON ecl_translation_jobs(model_id);
CREATE INDEX IF NOT EXISTS idx_ecl_jobs_status ON ecl_translation_jobs(status);

-- ============================================
-- RLS Policies
-- ============================================

-- ECL Translation Models
ALTER TABLE ecl_translation_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ECL models" ON ecl_translation_models
  FOR SELECT USING (user_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can create their own ECL models" ON ecl_translation_models
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can update their own ECL models" ON ecl_translation_models
  FOR UPDATE USING (user_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can delete their own ECL models" ON ecl_translation_models
  FOR DELETE USING (user_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'service_role');

-- ECL Training Pairs
ALTER TABLE ecl_training_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view training pairs for their models" ON ecl_training_pairs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ecl_translation_models
      WHERE id = model_id AND user_id = auth.uid()::text
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

CREATE POLICY "Users can create training pairs for their models" ON ecl_training_pairs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM ecl_translation_models
      WHERE id = model_id AND user_id = auth.uid()::text
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

CREATE POLICY "Users can delete training pairs for their models" ON ecl_training_pairs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM ecl_translation_models
      WHERE id = model_id AND user_id = auth.uid()::text
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- ECL Translation Jobs
ALTER TABLE ecl_translation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own translation jobs" ON ecl_translation_jobs
  FOR SELECT USING (user_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can create their own translation jobs" ON ecl_translation_jobs
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can update their own translation jobs" ON ecl_translation_jobs
  FOR UPDATE USING (user_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get ECL model statistics
CREATE OR REPLACE FUNCTION get_ecl_model_stats(p_model_id UUID)
RETURNS TABLE (
  total_pairs BIGINT,
  training_pairs BIGINT,
  validation_pairs BIGINT,
  avg_source_norm FLOAT,
  avg_target_norm FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_pairs,
    COUNT(*) FILTER (WHERE NOT is_validation)::BIGINT as training_pairs,
    COUNT(*) FILTER (WHERE is_validation)::BIGINT as validation_pairs,
    AVG(vector_norm(source_vector)) as avg_source_norm,
    AVG(vector_norm(target_vector)) as avg_target_norm
  FROM ecl_training_pairs
  WHERE model_id = p_model_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if a user has an ECL model for a specific model pair
CREATE OR REPLACE FUNCTION has_ecl_model(
  p_user_id TEXT,
  p_source_model TEXT,
  p_target_model TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM ecl_translation_models
    WHERE user_id = p_user_id
      AND source_model = p_source_model
      AND target_model = p_target_model
      AND status = 'ready'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get the best ECL model for a model pair
CREATE OR REPLACE FUNCTION get_best_ecl_model(
  p_user_id TEXT,
  p_source_model TEXT,
  p_target_model TEXT
)
RETURNS UUID AS $$
DECLARE
  best_model_id UUID;
BEGIN
  SELECT id INTO best_model_id
  FROM ecl_translation_models
  WHERE user_id = p_user_id
    AND source_model = p_source_model
    AND target_model = p_target_model
    AND status = 'ready'
  ORDER BY validation_rmse ASC NULLS LAST, created_at DESC
  LIMIT 1;

  RETURN best_model_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Triggers
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_ecl_model_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ecl_model_updated_at
  BEFORE UPDATE ON ecl_translation_models
  FOR EACH ROW
  EXECUTE FUNCTION update_ecl_model_timestamp();

-- Update training samples count
CREATE OR REPLACE FUNCTION update_ecl_training_samples()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ecl_translation_models
    SET training_samples = training_samples + 1
    WHERE id = NEW.model_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ecl_translation_models
    SET training_samples = training_samples - 1
    WHERE id = OLD.model_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ecl_training_samples_insert
  AFTER INSERT ON ecl_training_pairs
  FOR EACH ROW
  EXECUTE FUNCTION update_ecl_training_samples();

CREATE TRIGGER trg_ecl_training_samples_delete
  AFTER DELETE ON ecl_training_pairs
  FOR EACH ROW
  EXECUTE FUNCTION update_ecl_training_samples();

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE ecl_translation_models IS 'ECL translation models that map between different embedding spaces';
COMMENT ON TABLE ecl_training_pairs IS 'Training pairs for learning ECL translations';
COMMENT ON TABLE ecl_translation_jobs IS 'Background jobs for batch ECL translations';

COMMENT ON COLUMN ecl_translation_models.source_model IS 'Source embedding model identifier (e.g., text-embedding-ada-002)';
COMMENT ON COLUMN ecl_translation_models.target_model IS 'Target embedding model identifier (e.g., text-embedding-3-large)';
COMMENT ON COLUMN ecl_translation_models.translation_type IS 'Type of transformation: linear (matrix only), affine (matrix + bias), mlp (multi-layer)';
COMMENT ON COLUMN ecl_translation_models.weights IS 'Transformation matrix stored as nested JSON arrays';
COMMENT ON COLUMN ecl_translation_models.bias IS 'Bias vector for affine transformations';
COMMENT ON COLUMN ecl_translation_models.validation_rmse IS 'Root mean squared error on validation set (lower is better)';

COMMENT ON COLUMN ecl_training_pairs.text_hash IS 'SHA-256 hash of source text for deduplication';
COMMENT ON COLUMN ecl_training_pairs.is_validation IS 'True if this pair is reserved for validation, false for training';
