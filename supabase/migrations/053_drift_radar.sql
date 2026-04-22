-- Seizn RAG - Embedding Drift Radar
-- Migration: 053_drift_radar.sql
--
-- Detects distribution drift in embedding space to prevent quality degradation.
--
-- Tables:
-- - drift_snapshots: Daily distribution snapshots for collections
-- - drift_alerts: Drift detection alerts with recommendations

-- ===========================================
-- 1) Drift Snapshots
-- ===========================================
-- Stores daily embedding distribution metrics for drift analysis
CREATE TABLE IF NOT EXISTS drift_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Query distribution metrics
  query_centroid VECTOR(1024),           -- Mean query embedding vector
  query_count INT DEFAULT 0,             -- Number of queries in snapshot period
  query_entropy FLOAT,                   -- Shannon entropy of query distribution
  query_std_dev FLOAT,                   -- Standard deviation of query embeddings

  -- Document distribution metrics
  doc_centroid VECTOR(1024),             -- Mean document embedding vector
  doc_count INT DEFAULT 0,               -- Number of documents/chunks
  doc_entropy FLOAT,                     -- Shannon entropy of document distribution
  doc_std_dev FLOAT,                     -- Standard deviation of document embeddings

  -- Score distribution metrics (search quality indicators)
  avg_top1_score FLOAT,                  -- Average top-1 cosine similarity
  avg_topk_score FLOAT,                  -- Average top-K cosine similarity
  score_std_dev FLOAT,                   -- Score standard deviation
  min_score FLOAT,                       -- Minimum score observed
  max_score FLOAT,                       -- Maximum score observed

  -- Rerank distribution metrics
  rerank_boost_avg FLOAT,                -- Average rerank boost
  rerank_boost_std_dev FLOAT,            -- Rerank boost standard deviation
  rerank_position_change_avg FLOAT,      -- Average position change after rerank

  -- Computed drift metrics (vs previous snapshot)
  centroid_shift_magnitude FLOAT,        -- Euclidean distance from previous centroid
  entropy_change_pct FLOAT,              -- Percentage change in entropy
  score_change_pct FLOAT,                -- Percentage change in avg scores

  -- Raw data for detailed analysis
  metadata JSONB DEFAULT '{}'::JSONB,
  -- Structure: {
  --   query_sample_ids: string[],
  --   score_histogram: {bucket: number, count: number}[],
  --   embedding_model: string,
  --   dimension: number
  -- }

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one snapshot per collection per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_drift_snapshots_unique
  ON drift_snapshots(collection_id, snapshot_date);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_drift_snapshots_user_date
  ON drift_snapshots(user_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_drift_snapshots_collection_date
  ON drift_snapshots(collection_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_drift_snapshots_org
  ON drift_snapshots(org_id, snapshot_date DESC)
  WHERE org_id IS NOT NULL;

-- Index for drift detection (finding high drift)
CREATE INDEX IF NOT EXISTS idx_drift_snapshots_centroid_shift
  ON drift_snapshots(collection_id, centroid_shift_magnitude DESC)
  WHERE centroid_shift_magnitude IS NOT NULL;


-- ===========================================
-- 2) Drift Alerts
-- ===========================================
-- Stores alerts generated when drift exceeds thresholds
CREATE TABLE IF NOT EXISTS drift_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,

  -- Alert identification
  alert_type VARCHAR(50) NOT NULL
    CHECK (alert_type IN (
      'centroid_shift',     -- Query/doc centroid moved significantly
      'entropy_change',     -- Distribution diversity changed
      'score_drop',         -- Search relevance scores decreased
      'score_variance',     -- Score consistency changed
      'rerank_drift',       -- Reranker behavior changed
      'query_drift',        -- Query pattern changed
      'doc_drift',          -- Document distribution changed
      'embedding_anomaly'   -- Unusual embedding patterns
    )),

  severity VARCHAR(20) NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),

  -- Alert details
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Detected values
  current_value FLOAT,
  previous_value FLOAT,
  threshold FLOAT,
  deviation_pct FLOAT,

  -- Recommendations
  recommendations JSONB DEFAULT '[]'::JSONB,
  -- Structure: [{
  --   action: string,
  --   description: string,
  --   impact: 'low' | 'medium' | 'high',
  --   auto_applicable: boolean
  -- }]

  -- Related snapshots
  snapshot_id UUID REFERENCES drift_snapshots(id) ON DELETE SET NULL,
  comparison_snapshot_id UUID REFERENCES drift_snapshots(id) ON DELETE SET NULL,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'resolved', 'ignored')),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying alerts
CREATE INDEX IF NOT EXISTS idx_drift_alerts_user_status
  ON drift_alerts(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drift_alerts_collection_status
  ON drift_alerts(collection_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drift_alerts_type_severity
  ON drift_alerts(user_id, alert_type, severity)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_drift_alerts_org
  ON drift_alerts(org_id, status, created_at DESC)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drift_alerts_active
  ON drift_alerts(user_id, created_at DESC)
  WHERE status = 'active' AND acknowledged = FALSE;


-- ===========================================
-- 3) Drift Thresholds Configuration
-- ===========================================
-- Per-user/collection drift alert thresholds
CREATE TABLE IF NOT EXISTS drift_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES summer_collections(id) ON DELETE CASCADE,

  -- Threshold values
  centroid_shift_warning FLOAT DEFAULT 0.05,      -- 5% shift = warning
  centroid_shift_critical FLOAT DEFAULT 0.10,     -- 10% shift = critical

  entropy_change_warning FLOAT DEFAULT 15.0,      -- 15% change = warning
  entropy_change_critical FLOAT DEFAULT 25.0,     -- 25% change = critical

  score_drop_warning FLOAT DEFAULT 10.0,          -- 10% drop = warning
  score_drop_critical FLOAT DEFAULT 20.0,         -- 20% drop = critical

  -- Alert settings
  alerts_enabled BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT FALSE,
  webhook_url TEXT,

  -- Comparison settings
  comparison_window_days INT DEFAULT 7,           -- Compare against N days ago
  min_queries_for_alert INT DEFAULT 100,          -- Minimum queries before alerting

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, collection_id)
);

-- Index for threshold lookup
CREATE INDEX IF NOT EXISTS idx_drift_thresholds_user
  ON drift_thresholds(user_id);


-- ===========================================
-- 4) Functions
-- ===========================================

-- Function to calculate centroid shift magnitude between two vectors
CREATE OR REPLACE FUNCTION calculate_centroid_shift(
  old_centroid VECTOR(1024),
  new_centroid VECTOR(1024)
)
RETURNS FLOAT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF old_centroid IS NULL OR new_centroid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Return cosine distance (1 - cosine_similarity)
  RETURN 1.0 - (old_centroid <=> new_centroid);
END;
$$;


-- Function to get drift summary for a collection
CREATE OR REPLACE FUNCTION get_drift_summary(
  p_collection_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  snapshot_date DATE,
  query_count INT,
  doc_count INT,
  avg_top1_score FLOAT,
  centroid_shift FLOAT,
  entropy_change_pct FLOAT,
  score_change_pct FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.snapshot_date,
    ds.query_count,
    ds.doc_count,
    ds.avg_top1_score,
    ds.centroid_shift_magnitude,
    ds.entropy_change_pct,
    ds.score_change_pct
  FROM drift_snapshots ds
  WHERE ds.collection_id = p_collection_id
    AND ds.snapshot_date >= CURRENT_DATE - p_days
  ORDER BY ds.snapshot_date DESC;
END;
$$;


-- Function to detect drift and create alerts
CREATE OR REPLACE FUNCTION detect_drift_and_alert(
  p_snapshot_id UUID
)
RETURNS SETOF drift_alerts
LANGUAGE plpgsql
AS $$
DECLARE
  v_snapshot RECORD;
  v_prev_snapshot RECORD;
  v_thresholds RECORD;
  v_alert_id UUID;
  v_recommendations JSONB;
BEGIN
  -- Get the new snapshot
  SELECT * INTO v_snapshot
  FROM drift_snapshots
  WHERE id = p_snapshot_id;

  IF v_snapshot IS NULL THEN
    RETURN;
  END IF;

  -- Get previous snapshot (7 days ago by default)
  SELECT * INTO v_prev_snapshot
  FROM drift_snapshots
  WHERE collection_id = v_snapshot.collection_id
    AND snapshot_date < v_snapshot.snapshot_date
  ORDER BY snapshot_date DESC
  LIMIT 1;

  -- Get thresholds for this collection
  SELECT * INTO v_thresholds
  FROM drift_thresholds
  WHERE user_id = v_snapshot.user_id
    AND (collection_id = v_snapshot.collection_id OR collection_id IS NULL)
  ORDER BY collection_id NULLS LAST
  LIMIT 1;

  -- Use defaults if no custom thresholds
  IF v_thresholds IS NULL THEN
    v_thresholds := ROW(
      NULL, v_snapshot.user_id, NULL,
      0.05, 0.10,  -- centroid thresholds
      15.0, 25.0,  -- entropy thresholds
      10.0, 20.0,  -- score thresholds
      TRUE, FALSE, NULL, 7, 100,
      NOW(), NOW()
    );
  END IF;

  -- Skip if not enough queries
  IF v_snapshot.query_count < COALESCE(v_thresholds.min_queries_for_alert, 100) THEN
    RETURN;
  END IF;

  -- Check centroid shift
  IF v_snapshot.centroid_shift_magnitude IS NOT NULL THEN
    IF v_snapshot.centroid_shift_magnitude >= COALESCE(v_thresholds.centroid_shift_critical, 0.10) THEN
      v_recommendations := '[
        {"action": "reindex", "description": "Consider reindexing documents with updated embeddings", "impact": "high", "auto_applicable": false},
        {"action": "review_queries", "description": "Review recent query patterns for anomalies", "impact": "medium", "auto_applicable": false},
        {"action": "adjust_topk", "description": "Increase topK from 20 to 50 to capture more diverse results", "impact": "low", "auto_applicable": true}
      ]'::JSONB;

      INSERT INTO drift_alerts (
        user_id, org_id, collection_id,
        alert_type, severity, title, message,
        current_value, previous_value, threshold, deviation_pct,
        recommendations, snapshot_id, comparison_snapshot_id
      )
      VALUES (
        v_snapshot.user_id, v_snapshot.org_id, v_snapshot.collection_id,
        'centroid_shift', 'critical',
        'Critical: Query distribution shift detected',
        format('Query centroid shifted by %.1f%% in collection. This may indicate significant changes in user search patterns or document distribution.',
               v_snapshot.centroid_shift_magnitude * 100),
        v_snapshot.centroid_shift_magnitude,
        CASE WHEN v_prev_snapshot IS NOT NULL THEN 0 ELSE NULL END,
        v_thresholds.centroid_shift_critical,
        v_snapshot.centroid_shift_magnitude * 100,
        v_recommendations,
        v_snapshot.id,
        CASE WHEN v_prev_snapshot IS NOT NULL THEN v_prev_snapshot.id ELSE NULL END
      )
      RETURNING * INTO v_alert_id;

      RETURN NEXT (SELECT * FROM drift_alerts WHERE id = v_alert_id);

    ELSIF v_snapshot.centroid_shift_magnitude >= COALESCE(v_thresholds.centroid_shift_warning, 0.05) THEN
      v_recommendations := '[
        {"action": "monitor", "description": "Continue monitoring for trend", "impact": "low", "auto_applicable": false},
        {"action": "review_queries", "description": "Review recent query patterns", "impact": "medium", "auto_applicable": false}
      ]'::JSONB;

      INSERT INTO drift_alerts (
        user_id, org_id, collection_id,
        alert_type, severity, title, message,
        current_value, threshold, deviation_pct,
        recommendations, snapshot_id
      )
      VALUES (
        v_snapshot.user_id, v_snapshot.org_id, v_snapshot.collection_id,
        'centroid_shift', 'warning',
        'Warning: Query distribution change detected',
        format('Query centroid shifted by %.1f%%. Monitor for continued drift.',
               v_snapshot.centroid_shift_magnitude * 100),
        v_snapshot.centroid_shift_magnitude,
        v_thresholds.centroid_shift_warning,
        v_snapshot.centroid_shift_magnitude * 100,
        v_recommendations,
        v_snapshot.id
      )
      RETURNING id INTO v_alert_id;

      RETURN NEXT (SELECT * FROM drift_alerts WHERE id = v_alert_id);
    END IF;
  END IF;

  -- Check score drop
  IF v_snapshot.score_change_pct IS NOT NULL AND v_snapshot.score_change_pct < 0 THEN
    IF ABS(v_snapshot.score_change_pct) >= COALESCE(v_thresholds.score_drop_critical, 20.0) THEN
      v_recommendations := '[
        {"action": "reindex", "description": "Reindex collection to refresh embeddings", "impact": "high", "auto_applicable": false},
        {"action": "adjust_chunk_size", "description": "Review and adjust chunk size for better context", "impact": "medium", "auto_applicable": false},
        {"action": "enable_rerank", "description": "Enable or tune reranker for better precision", "impact": "medium", "auto_applicable": true},
        {"action": "model_update", "description": "Consider updating embedding model", "impact": "high", "auto_applicable": false}
      ]'::JSONB;

      INSERT INTO drift_alerts (
        user_id, org_id, collection_id,
        alert_type, severity, title, message,
        current_value, previous_value, threshold, deviation_pct,
        recommendations, snapshot_id
      )
      VALUES (
        v_snapshot.user_id, v_snapshot.org_id, v_snapshot.collection_id,
        'score_drop', 'critical',
        'Critical: Search quality degradation detected',
        format('Average search scores dropped by %.1f%%. Immediate action recommended.',
               ABS(v_snapshot.score_change_pct)),
        v_snapshot.avg_top1_score,
        CASE WHEN v_prev_snapshot IS NOT NULL THEN v_prev_snapshot.avg_top1_score ELSE NULL END,
        v_thresholds.score_drop_critical,
        ABS(v_snapshot.score_change_pct),
        v_recommendations,
        v_snapshot.id
      )
      RETURNING id INTO v_alert_id;

      RETURN NEXT (SELECT * FROM drift_alerts WHERE id = v_alert_id);

    ELSIF ABS(v_snapshot.score_change_pct) >= COALESCE(v_thresholds.score_drop_warning, 10.0) THEN
      v_recommendations := '[
        {"action": "monitor", "description": "Monitor score trends over next few days", "impact": "low", "auto_applicable": false},
        {"action": "review_new_docs", "description": "Review recently added documents for quality", "impact": "medium", "auto_applicable": false}
      ]'::JSONB;

      INSERT INTO drift_alerts (
        user_id, org_id, collection_id,
        alert_type, severity, title, message,
        current_value, threshold, deviation_pct,
        recommendations, snapshot_id
      )
      VALUES (
        v_snapshot.user_id, v_snapshot.org_id, v_snapshot.collection_id,
        'score_drop', 'warning',
        'Warning: Search quality decline detected',
        format('Average search scores dropped by %.1f%%.',
               ABS(v_snapshot.score_change_pct)),
        v_snapshot.avg_top1_score,
        v_thresholds.score_drop_warning,
        ABS(v_snapshot.score_change_pct),
        v_recommendations,
        v_snapshot.id
      )
      RETURNING id INTO v_alert_id;

      RETURN NEXT (SELECT * FROM drift_alerts WHERE id = v_alert_id);
    END IF;
  END IF;

  -- Check entropy change
  IF v_snapshot.entropy_change_pct IS NOT NULL THEN
    IF ABS(v_snapshot.entropy_change_pct) >= COALESCE(v_thresholds.entropy_change_critical, 25.0) THEN
      v_recommendations := '[
        {"action": "review_diversity", "description": "Review query diversity and document coverage", "impact": "medium", "auto_applicable": false},
        {"action": "adjust_topk", "description": "Adjust topK parameter to match new distribution", "impact": "low", "auto_applicable": true}
      ]'::JSONB;

      INSERT INTO drift_alerts (
        user_id, org_id, collection_id,
        alert_type, severity, title, message,
        current_value, previous_value, threshold, deviation_pct,
        recommendations, snapshot_id
      )
      VALUES (
        v_snapshot.user_id, v_snapshot.org_id, v_snapshot.collection_id,
        'entropy_change', 'warning',
        'Search diversity significantly changed',
        format('Query entropy changed by %.1f%%. This may indicate shift in search patterns.',
               v_snapshot.entropy_change_pct),
        v_snapshot.query_entropy,
        CASE WHEN v_prev_snapshot IS NOT NULL THEN v_prev_snapshot.query_entropy ELSE NULL END,
        v_thresholds.entropy_change_critical,
        ABS(v_snapshot.entropy_change_pct),
        v_recommendations,
        v_snapshot.id
      )
      RETURNING id INTO v_alert_id;

      RETURN NEXT (SELECT * FROM drift_alerts WHERE id = v_alert_id);
    END IF;
  END IF;

  RETURN;
END;
$$;


-- ===========================================
-- 5) RLS Policies
-- ===========================================

-- Enable RLS
ALTER TABLE drift_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_thresholds ENABLE ROW LEVEL SECURITY;

-- Drift Snapshots policies
CREATE POLICY drift_snapshots_select ON drift_snapshots
  FOR SELECT
  USING (
    user_id = auth.uid()::TEXT
    OR org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY drift_snapshots_insert ON drift_snapshots
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::TEXT);

CREATE POLICY drift_snapshots_update ON drift_snapshots
  FOR UPDATE
  USING (user_id = auth.uid()::TEXT);

CREATE POLICY drift_snapshots_delete ON drift_snapshots
  FOR DELETE
  USING (user_id = auth.uid()::TEXT);

-- Drift Alerts policies
CREATE POLICY drift_alerts_select ON drift_alerts
  FOR SELECT
  USING (
    user_id = auth.uid()::TEXT
    OR org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::TEXT
    )
  );

CREATE POLICY drift_alerts_insert ON drift_alerts
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::TEXT);

CREATE POLICY drift_alerts_update ON drift_alerts
  FOR UPDATE
  USING (user_id = auth.uid()::TEXT);

CREATE POLICY drift_alerts_delete ON drift_alerts
  FOR DELETE
  USING (user_id = auth.uid()::TEXT);

-- Drift Thresholds policies
CREATE POLICY drift_thresholds_select ON drift_thresholds
  FOR SELECT
  USING (user_id = auth.uid()::TEXT);

CREATE POLICY drift_thresholds_all ON drift_thresholds
  FOR ALL
  USING (user_id = auth.uid()::TEXT);


-- ===========================================
-- 6) Triggers
-- ===========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at
CREATE TRIGGER drift_snapshots_updated_at
  BEFORE UPDATE ON drift_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER drift_alerts_updated_at
  BEFORE UPDATE ON drift_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER drift_thresholds_updated_at
  BEFORE UPDATE ON drift_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ===========================================
-- 7) Comments
-- ===========================================

COMMENT ON TABLE drift_snapshots IS 'Daily embedding distribution snapshots for drift detection';
COMMENT ON TABLE drift_alerts IS 'Drift detection alerts with recommendations';
COMMENT ON TABLE drift_thresholds IS 'Per-user/collection drift alert thresholds';

COMMENT ON COLUMN drift_snapshots.query_centroid IS 'Mean query embedding vector for the snapshot period';
COMMENT ON COLUMN drift_snapshots.query_entropy IS 'Shannon entropy measuring query distribution diversity';
COMMENT ON COLUMN drift_snapshots.centroid_shift_magnitude IS 'Euclidean distance from previous snapshot centroid';
COMMENT ON COLUMN drift_alerts.recommendations IS 'JSON array of recommended actions with impact assessment';
