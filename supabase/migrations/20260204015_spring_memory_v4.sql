-- =============================================================================
-- Spring Memory v4: Mem0-Inspired Lifecycle Features
-- =============================================================================
-- Features:
-- 1. Ingestion Controls (rules, confidence thresholds, category filters)
-- 2. Advanced Filters v2 (query-time precision)
-- 3. Memory Assets (multimodal support)
-- 4. Memory Usage Tracking (where used)
-- 5. Async Job Queue
-- =============================================================================

-- =============================================================================
-- 1. INGESTION RULES
-- =============================================================================

CREATE TABLE IF NOT EXISTS spring_ingestion_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workspace_id UUID, -- Optional workspace scoping

  -- Rule identification
  name TEXT NOT NULL,
  description TEXT,
  priority INT NOT NULL DEFAULT 100, -- Lower = higher priority
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Scope filters
  namespace TEXT, -- NULL = all namespaces
  agent_id TEXT, -- NULL = all agents

  -- Content filters
  note_types TEXT[], -- fact, preference, instruction, episode, procedure, relationship
  categories TEXT[], -- health, finance, auth, secrets, personal, work, etc.
  tag_patterns TEXT[], -- regex patterns for tags
  content_patterns TEXT[], -- regex patterns for content (PII, API keys, etc.)

  -- Confidence control
  confidence_threshold NUMERIC(3,2) DEFAULT 0.75, -- 0.00 to 1.00

  -- Action
  action TEXT NOT NULL CHECK (action IN ('store', 'redact', 'deny', 'store_as_candidate')),
  redact_replacement TEXT DEFAULT '[REDACTED]',

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for rule lookup
CREATE INDEX IF NOT EXISTS idx_ingestion_rules_user ON spring_ingestion_rules(user_id, enabled, priority);
CREATE INDEX IF NOT EXISTS idx_ingestion_rules_workspace ON spring_ingestion_rules(workspace_id, enabled, priority);

-- =============================================================================
-- 2. USER INGESTION SETTINGS (global toggles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spring_ingestion_settings (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Master toggles
  auto_save_enabled BOOLEAN NOT NULL DEFAULT true,
  candidate_mode_enabled BOOLEAN NOT NULL DEFAULT false, -- Review before saving

  -- Default confidence threshold
  default_confidence_threshold NUMERIC(3,2) DEFAULT 0.75,

  -- Strictness level (maps to confidence: low=0.5, medium=0.75, high=0.9, very_high=0.95)
  strictness TEXT NOT NULL DEFAULT 'medium' CHECK (strictness IN ('low', 'medium', 'high', 'very_high')),

  -- Blocked categories (never store)
  blocked_categories TEXT[] DEFAULT '{}',

  -- Blocked patterns (PII, secrets, etc.)
  blocked_patterns TEXT[] DEFAULT ARRAY[
    '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', -- Email
    '\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b', -- Phone
    '\\b\\d{6}[-\\s]?\\d{7}\\b', -- Korean resident ID
    'sk-[a-zA-Z0-9]{48}', -- OpenAI API key
    'AKIA[0-9A-Z]{16}' -- AWS Access Key
  ],

  -- Sensitive capsule settings
  sensitive_capsule_enabled BOOLEAN NOT NULL DEFAULT true,
  sensitive_categories TEXT[] DEFAULT ARRAY['health', 'finance', 'auth', 'secrets'],

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. MEMORY ASSETS (for multimodal support)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spring_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Storage info
  storage_provider TEXT NOT NULL DEFAULT 'r2', -- r2, s3, local
  storage_key TEXT NOT NULL, -- Path/key in storage

  -- File metadata
  filename TEXT,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  sha256_hash TEXT NOT NULL,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  processing_error TEXT,

  -- Extracted content
  extracted_text TEXT,
  extracted_metadata JSONB DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assets_user ON spring_assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_hash ON spring_assets(sha256_hash);

-- =============================================================================
-- 4. ASSET LINKS (connecting assets to notes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spring_asset_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES spring_assets(id) ON DELETE CASCADE,

  -- Relation type
  relation TEXT NOT NULL DEFAULT 'source' CHECK (relation IN ('source', 'attachment', 'reference', 'derived')),

  -- Position info (for images with multiple extractions)
  position_info JSONB, -- {page: 1, bbox: [x1,y1,x2,y2], etc.}

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(note_id, asset_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_asset_links_note ON spring_asset_links(note_id);
CREATE INDEX IF NOT EXISTS idx_asset_links_asset ON spring_asset_links(asset_id);

-- =============================================================================
-- 5. MEMORY USAGE TRACKING (where used)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spring_memory_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,

  -- Context where memory was used
  trace_id UUID, -- Fall trace ID
  span_id TEXT,
  session_id TEXT,
  agent_id TEXT,

  -- Usage details
  usage_type TEXT NOT NULL CHECK (usage_type IN ('recalled', 'cited', 'influenced', 'rejected')),
  relevance_score NUMERIC(4,3), -- 0.000 to 1.000

  -- Outcome tracking
  outcome TEXT CHECK (outcome IN ('success', 'failure', 'unknown')),
  feedback TEXT CHECK (feedback IN ('positive', 'negative', 'neutral')),
  feedback_reason TEXT,

  -- Request context
  query_text TEXT,
  response_snippet TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_usage_note ON spring_memory_usage(note_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_usage_trace ON spring_memory_usage(trace_id);
CREATE INDEX IF NOT EXISTS idx_memory_usage_outcome ON spring_memory_usage(note_id, outcome);

-- =============================================================================
-- 6. ASYNC JOB QUEUE (for ingestion/consolidation/export)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spring_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Job type
  job_type TEXT NOT NULL CHECK (job_type IN (
    'ingest', 'ingest_multimodal', 'consolidate', 'distill',
    'export', 'bulk_update', 'bulk_delete'
  )),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),

  -- Input/Output
  input_data JSONB NOT NULL DEFAULT '{}',
  output_data JSONB,

  -- Progress tracking
  total_items INT,
  processed_items INT DEFAULT 0,
  failed_items INT DEFAULT 0,

  -- Error handling
  error_message TEXT,
  error_details JSONB,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ -- For export jobs, when download expires
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON spring_jobs(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON spring_jobs(status, created_at) WHERE status = 'pending';

-- =============================================================================
-- 7. EXPORT TEMPLATES (for structured exports)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spring_export_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, -- NULL = system template

  name TEXT NOT NULL,
  description TEXT,

  -- Schema definition (JSON Schema format)
  output_schema JSONB NOT NULL,

  -- Field mappings
  field_mappings JSONB NOT NULL DEFAULT '{}',

  -- Output options
  output_format TEXT NOT NULL DEFAULT 'json' CHECK (output_format IN ('json', 'jsonl', 'csv', 'markdown')),
  include_metadata BOOLEAN DEFAULT true,
  include_provenance BOOLEAN DEFAULT false,

  -- Built-in vs custom
  is_system BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default export templates
INSERT INTO spring_export_templates (id, name, description, output_schema, field_mappings, is_system) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'full_export',
    'Export all memory fields',
    '{"type":"object","properties":{"id":{"type":"string"},"content":{"type":"string"},"type":{"type":"string"},"tags":{"type":"array"},"metadata":{"type":"object"},"created_at":{"type":"string"}}}',
    '{"id":"id","content":"content","type":"type","tags":"tags","metadata":"metadata","created_at":"created_at"}',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'minimal_export',
    'Export only essential fields',
    '{"type":"object","properties":{"content":{"type":"string"},"type":{"type":"string"},"tags":{"type":"array"}}}',
    '{"content":"content","type":"type","tags":"tags"}',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'mindmap_export',
    'Export for MindMap visualization',
    '{"type":"object","properties":{"nodes":{"type":"array"},"edges":{"type":"array"}}}',
    '{}',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 8. ENHANCED SEARCH SUPPORT
-- =============================================================================

-- Add category column to notes if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spring_memory_notes' AND column_name = 'category'
  ) THEN
    ALTER TABLE spring_memory_notes ADD COLUMN category TEXT;
  END IF;
END $$;

-- Add valid_until column for time-based filtering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spring_memory_notes' AND column_name = 'valid_until'
  ) THEN
    ALTER TABLE spring_memory_notes ADD COLUMN valid_until TIMESTAMPTZ;
  END IF;
END $$;

-- Add extraction_confidence column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spring_memory_notes' AND column_name = 'extraction_confidence'
  ) THEN
    ALTER TABLE spring_memory_notes ADD COLUMN extraction_confidence NUMERIC(3,2);
  END IF;
END $$;

-- Indexes for filtered search
CREATE INDEX IF NOT EXISTS idx_notes_category ON spring_memory_notes(user_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_valid_until ON spring_memory_notes(user_id, valid_until) WHERE valid_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_time_range ON spring_memory_notes(user_id, created_at DESC);

-- =============================================================================
-- 9. SEARCH V3 FUNCTION (with advanced filters)
-- =============================================================================

CREATE OR REPLACE FUNCTION search_spring_memory_notes_v3(
  p_user_id TEXT,
  p_query_embedding vector(1536),
  p_query_text TEXT DEFAULT NULL,
  p_types TEXT[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_privacy_classes TEXT[] DEFAULT NULL,
  p_statuses TEXT[] DEFAULT NULL,
  p_agent_id TEXT DEFAULT NULL,
  p_namespace TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_include_expired BOOLEAN DEFAULT false,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  type TEXT,
  status TEXT,
  category TEXT,
  tags TEXT[],
  privacy_class TEXT,
  metadata JSONB,
  extraction_confidence NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  semantic_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
) AS $$
DECLARE
  v_ts_query tsquery;
BEGIN
  -- Build text search query if provided
  IF p_query_text IS NOT NULL AND p_query_text != '' THEN
    v_ts_query := websearch_to_tsquery('english', p_query_text);
  END IF;

  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      n.id,
      1 - (n.embedding <=> p_query_embedding) AS score
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status != 'deleted'
      AND (p_types IS NULL OR n.type = ANY(p_types))
      AND (p_categories IS NULL OR n.category = ANY(p_categories))
      AND (p_tags IS NULL OR n.tags && p_tags)
      AND (p_privacy_classes IS NULL OR n.privacy_class = ANY(p_privacy_classes))
      AND (p_statuses IS NULL OR n.status = ANY(p_statuses))
      AND (p_namespace IS NULL OR n.scope = p_namespace)
      AND (p_since IS NULL OR n.created_at >= p_since)
      AND (p_until IS NULL OR n.created_at <= p_until)
      AND (p_include_expired OR n.valid_until IS NULL OR n.valid_until > now())
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT p_limit * 2
  ),
  keyword_results AS (
    SELECT
      n.id,
      CASE
        WHEN v_ts_query IS NOT NULL THEN ts_rank_cd(n.content_tsv, v_ts_query)
        ELSE 0
      END AS score
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status != 'deleted'
      AND (v_ts_query IS NULL OR n.content_tsv @@ v_ts_query)
      AND (p_types IS NULL OR n.type = ANY(p_types))
      AND (p_categories IS NULL OR n.category = ANY(p_categories))
      AND (p_tags IS NULL OR n.tags && p_tags)
      AND (p_privacy_classes IS NULL OR n.privacy_class = ANY(p_privacy_classes))
      AND (p_statuses IS NULL OR n.status = ANY(p_statuses))
      AND (p_namespace IS NULL OR n.scope = p_namespace)
      AND (p_since IS NULL OR n.created_at >= p_since)
      AND (p_until IS NULL OR n.created_at <= p_until)
      AND (p_include_expired OR n.valid_until IS NULL OR n.valid_until > now())
    LIMIT p_limit * 2
  ),
  combined AS (
    SELECT
      COALESCE(s.id, k.id) AS id,
      COALESCE(s.score, 0) AS semantic_score,
      COALESCE(k.score, 0) AS keyword_score,
      -- RRF combination
      (1.0 / (60 + COALESCE(ROW_NUMBER() OVER (ORDER BY s.score DESC NULLS LAST), 1000))) +
      (1.0 / (60 + COALESCE(ROW_NUMBER() OVER (ORDER BY k.score DESC NULLS LAST), 1000))) AS combined_score
    FROM semantic_results s
    FULL OUTER JOIN keyword_results k ON s.id = k.id
  )
  SELECT
    n.id,
    n.content,
    n.type,
    n.status,
    n.category,
    n.tags,
    n.privacy_class,
    n.metadata,
    n.extraction_confidence,
    n.created_at,
    n.updated_at,
    n.valid_until,
    c.semantic_score::FLOAT,
    c.keyword_score::FLOAT,
    c.combined_score::FLOAT
  FROM combined c
  JOIN spring_memory_notes n ON n.id = c.id
  ORDER BY c.combined_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 10. RLS POLICIES
-- =============================================================================

ALTER TABLE spring_ingestion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_ingestion_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_asset_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_memory_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_export_templates ENABLE ROW LEVEL SECURITY;

-- Ingestion rules policies
CREATE POLICY "Users can manage their own ingestion rules"
  ON spring_ingestion_rules FOR ALL
  USING (user_id = auth.uid()::text);

-- Ingestion settings policies
CREATE POLICY "Users can manage their own ingestion settings"
  ON spring_ingestion_settings FOR ALL
  USING (user_id = auth.uid()::text);

-- Assets policies
CREATE POLICY "Users can manage their own assets"
  ON spring_assets FOR ALL
  USING (user_id = auth.uid()::text);

-- Asset links policies (through note ownership)
CREATE POLICY "Users can view asset links for their notes"
  ON spring_asset_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM spring_memory_notes n
    WHERE n.id = note_id AND n.user_id = auth.uid()::text
  ));

CREATE POLICY "Users can manage asset links for their notes"
  ON spring_asset_links FOR ALL
  USING (EXISTS (
    SELECT 1 FROM spring_memory_notes n
    WHERE n.id = note_id AND n.user_id = auth.uid()::text
  ));

-- Memory usage policies
CREATE POLICY "Users can view usage of their memories"
  ON spring_memory_usage FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM spring_memory_notes n
    WHERE n.id = note_id AND n.user_id = auth.uid()::text
  ));

CREATE POLICY "Service role can insert usage records"
  ON spring_memory_usage FOR INSERT
  WITH CHECK (true);

-- Jobs policies
CREATE POLICY "Users can manage their own jobs"
  ON spring_jobs FOR ALL
  USING (user_id = auth.uid()::text);

-- Export templates policies
CREATE POLICY "Users can view system templates"
  ON spring_export_templates FOR SELECT
  USING (is_system = true OR user_id = auth.uid()::text);

CREATE POLICY "Users can manage their own templates"
  ON spring_export_templates FOR ALL
  USING (user_id = auth.uid()::text);

-- =============================================================================
-- 11. HELPER FUNCTIONS
-- =============================================================================

-- Get applicable ingestion rules for a context
CREATE OR REPLACE FUNCTION get_applicable_ingestion_rules(
  p_user_id TEXT,
  p_workspace_id UUID DEFAULT NULL,
  p_namespace TEXT DEFAULT NULL,
  p_agent_id TEXT DEFAULT NULL,
  p_note_type TEXT DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  action TEXT,
  confidence_threshold NUMERIC,
  content_patterns TEXT[],
  redact_replacement TEXT,
  priority INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.action,
    r.confidence_threshold,
    r.content_patterns,
    r.redact_replacement,
    r.priority
  FROM spring_ingestion_rules r
  WHERE r.user_id = p_user_id
    AND r.enabled = true
    AND (r.workspace_id IS NULL OR r.workspace_id = p_workspace_id)
    AND (r.namespace IS NULL OR r.namespace = p_namespace)
    AND (r.agent_id IS NULL OR r.agent_id = p_agent_id)
    AND (r.note_types IS NULL OR p_note_type = ANY(r.note_types))
    AND (r.categories IS NULL OR r.categories && p_categories)
  ORDER BY r.priority ASC, r.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get user's ingestion settings with defaults
CREATE OR REPLACE FUNCTION get_ingestion_settings(p_user_id TEXT)
RETURNS TABLE (
  auto_save_enabled BOOLEAN,
  candidate_mode_enabled BOOLEAN,
  default_confidence_threshold NUMERIC,
  strictness TEXT,
  blocked_categories TEXT[],
  blocked_patterns TEXT[],
  sensitive_capsule_enabled BOOLEAN,
  sensitive_categories TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.auto_save_enabled, true),
    COALESCE(s.candidate_mode_enabled, false),
    COALESCE(s.default_confidence_threshold, 0.75),
    COALESCE(s.strictness, 'medium'),
    COALESCE(s.blocked_categories, '{}'),
    COALESCE(s.blocked_patterns, ARRAY[
      '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
      '\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
      '\b\d{6}[-\s]?\d{7}\b',
      'sk-[a-zA-Z0-9]{48}',
      'AKIA[0-9A-Z]{16}'
    ]),
    COALESCE(s.sensitive_capsule_enabled, true),
    COALESCE(s.sensitive_categories, ARRAY['health', 'finance', 'auth', 'secrets'])
  FROM (SELECT p_user_id AS uid) t
  LEFT JOIN spring_ingestion_settings s ON s.user_id = t.uid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Record memory usage
CREATE OR REPLACE FUNCTION record_memory_usage(
  p_note_id UUID,
  p_usage_type TEXT,
  p_trace_id UUID DEFAULT NULL,
  p_span_id TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_agent_id TEXT DEFAULT NULL,
  p_relevance_score NUMERIC DEFAULT NULL,
  p_query_text TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_usage_id UUID;
BEGIN
  INSERT INTO spring_memory_usage (
    note_id, usage_type, trace_id, span_id, session_id,
    agent_id, relevance_score, query_text
  )
  VALUES (
    p_note_id, p_usage_type, p_trace_id, p_span_id, p_session_id,
    p_agent_id, p_relevance_score, p_query_text
  )
  RETURNING id INTO v_usage_id;

  RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql;

-- Update memory usage outcome
CREATE OR REPLACE FUNCTION update_memory_usage_outcome(
  p_usage_id UUID,
  p_outcome TEXT,
  p_feedback TEXT DEFAULT NULL,
  p_feedback_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE spring_memory_usage
  SET
    outcome = p_outcome,
    feedback = p_feedback,
    feedback_reason = p_feedback_reason
  WHERE id = p_usage_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 12. UPDATE TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_ingestion_rules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ingestion_rules_updated
  BEFORE UPDATE ON spring_ingestion_rules
  FOR EACH ROW EXECUTE FUNCTION update_ingestion_rules_timestamp();

CREATE TRIGGER trigger_ingestion_settings_updated
  BEFORE UPDATE ON spring_ingestion_settings
  FOR EACH ROW EXECUTE FUNCTION update_ingestion_rules_timestamp();

CREATE TRIGGER trigger_export_templates_updated
  BEFORE UPDATE ON spring_export_templates
  FOR EACH ROW EXECUTE FUNCTION update_ingestion_rules_timestamp();
