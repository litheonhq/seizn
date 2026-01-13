-- ============================================
-- Migration: 054_test_suites.sql
-- Retrieval Unit Tests / Regression Test Infrastructure
-- ============================================

-- ============================================
-- Test Suites Table
-- ============================================
CREATE TABLE IF NOT EXISTS retrieval_test_suites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  collection_id UUID,  -- Optional: specific collection to test
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Generation metadata
  generated_by VARCHAR(50) DEFAULT 'manual',  -- auto, manual
  source_doc_ids JSONB DEFAULT '[]'::jsonb,   -- Document IDs used for test generation

  -- Suite settings
  config JSONB DEFAULT '{}'::jsonb,  -- topK, threshold, search_type, etc.
  tags TEXT[] DEFAULT '{}',

  -- Status tracking
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_result VARCHAR(20),  -- passed, failed, partial

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_suites_user_id ON retrieval_test_suites(user_id);
CREATE INDEX IF NOT EXISTS idx_test_suites_collection_id ON retrieval_test_suites(collection_id);
CREATE INDEX IF NOT EXISTS idx_test_suites_is_active ON retrieval_test_suites(is_active) WHERE is_active = true;

-- ============================================
-- Test Cases Table
-- ============================================
CREATE TABLE IF NOT EXISTS retrieval_test_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suite_id UUID NOT NULL REFERENCES retrieval_test_suites(id) ON DELETE CASCADE,

  -- Test definition
  name VARCHAR(255),  -- Optional friendly name
  query TEXT NOT NULL,
  test_type VARCHAR(50) NOT NULL DEFAULT 'positive',  -- positive, negative, edge_case

  -- Expectations
  expected_doc_ids JSONB DEFAULT '[]'::jsonb,   -- Expected document IDs to be retrieved
  expected_keywords JSONB DEFAULT '[]'::jsonb,  -- Keywords that should appear in results/answer
  expected_not_keywords JSONB DEFAULT '[]'::jsonb,  -- Keywords that should NOT appear
  min_score FLOAT DEFAULT 0.7,  -- Minimum relevance score expected
  max_latency_ms INT DEFAULT 5000,  -- Maximum acceptable latency

  -- Generation metadata
  generated_from_doc_id UUID,  -- Source document if auto-generated
  generation_context TEXT,  -- Context used for generation

  -- Execution results (last run)
  last_run_at TIMESTAMPTZ,
  last_result VARCHAR(20),  -- pass, fail, skip
  last_score FLOAT,
  last_latency_ms INT,
  last_retrieved_doc_ids JSONB,
  last_error TEXT,

  -- Tracking
  run_count INT DEFAULT 0,
  pass_count INT DEFAULT 0,
  fail_count INT DEFAULT 0,

  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_cases_suite_id ON retrieval_test_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_test_type ON retrieval_test_cases(test_type);
CREATE INDEX IF NOT EXISTS idx_test_cases_is_active ON retrieval_test_cases(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_test_cases_last_result ON retrieval_test_cases(last_result);

-- ============================================
-- Test Runs Table (Run History)
-- ============================================
CREATE TABLE IF NOT EXISTS retrieval_test_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suite_id UUID NOT NULL REFERENCES retrieval_test_suites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Run summary
  status VARCHAR(20) NOT NULL DEFAULT 'running',  -- running, completed, failed, cancelled
  total_cases INT NOT NULL DEFAULT 0,
  passed INT DEFAULT 0,
  failed INT DEFAULT 0,
  skipped INT DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,

  -- Detailed results
  results JSONB DEFAULT '[]'::jsonb,  -- Array of {case_id, result, score, latency_ms, details}

  -- Config snapshot (for reproducibility)
  config_snapshot JSONB,

  -- Trigger info
  triggered_by VARCHAR(50) DEFAULT 'manual',  -- manual, ci, schedule, webhook
  trigger_context JSONB,  -- Additional context (CI build ID, etc.)

  -- Statistics
  avg_score FLOAT,
  avg_latency_ms FLOAT,
  p50_latency_ms INT,
  p95_latency_ms INT,
  p99_latency_ms INT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_runs_suite_id ON retrieval_test_runs(suite_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_user_id ON retrieval_test_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON retrieval_test_runs(status);
CREATE INDEX IF NOT EXISTS idx_test_runs_created_at ON retrieval_test_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_triggered_by ON retrieval_test_runs(triggered_by);

-- ============================================
-- Test Case Run Details (Individual Case Results per Run)
-- ============================================
CREATE TABLE IF NOT EXISTS retrieval_test_case_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES retrieval_test_runs(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES retrieval_test_cases(id) ON DELETE CASCADE,

  -- Result
  result VARCHAR(20) NOT NULL,  -- pass, fail, skip, error
  error_message TEXT,

  -- Scores and metrics
  relevance_score FLOAT,
  keyword_match_score FLOAT,
  faithfulness_score FLOAT,
  latency_ms INT,

  -- Retrieved data
  retrieved_doc_ids JSONB,
  retrieved_content_preview TEXT,
  matched_keywords JSONB,
  missing_keywords JSONB,

  -- Trace reference
  trace_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_case_runs_run_id ON retrieval_test_case_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_case_runs_case_id ON retrieval_test_case_runs(case_id);
CREATE INDEX IF NOT EXISTS idx_case_runs_result ON retrieval_test_case_runs(result);

-- ============================================
-- Test Generation Templates
-- ============================================
CREATE TABLE IF NOT EXISTS retrieval_test_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Template type
  template_type VARCHAR(50) NOT NULL DEFAULT 'custom',  -- positive, negative, edge_case, custom

  -- Prompt template for test generation
  prompt_template TEXT NOT NULL,

  -- Default settings
  default_config JSONB DEFAULT '{}'::jsonb,

  -- Built-in vs custom
  is_builtin BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_test_templates_user_id ON retrieval_test_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_test_templates_is_builtin ON retrieval_test_templates(is_builtin);

-- ============================================
-- RLS Policies
-- ============================================

-- Test Suites
ALTER TABLE retrieval_test_suites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own test suites" ON retrieval_test_suites
  FOR SELECT USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can create their own test suites" ON retrieval_test_suites
  FOR INSERT WITH CHECK (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can update their own test suites" ON retrieval_test_suites
  FOR UPDATE USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can delete their own test suites" ON retrieval_test_suites
  FOR DELETE USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

-- Test Cases
ALTER TABLE retrieval_test_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view test cases in their suites" ON retrieval_test_cases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM retrieval_test_suites WHERE id = suite_id AND user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'service_role'
  );

CREATE POLICY "Users can create test cases in their suites" ON retrieval_test_cases
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM retrieval_test_suites WHERE id = suite_id AND user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'service_role'
  );

CREATE POLICY "Users can update test cases in their suites" ON retrieval_test_cases
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM retrieval_test_suites WHERE id = suite_id AND user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'service_role'
  );

CREATE POLICY "Users can delete test cases in their suites" ON retrieval_test_cases
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM retrieval_test_suites WHERE id = suite_id AND user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Test Runs
ALTER TABLE retrieval_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own test runs" ON retrieval_test_runs
  FOR SELECT USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can create their own test runs" ON retrieval_test_runs
  FOR INSERT WITH CHECK (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can update their own test runs" ON retrieval_test_runs
  FOR UPDATE USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

-- Test Case Runs
ALTER TABLE retrieval_test_case_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view case runs for their test runs" ON retrieval_test_case_runs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM retrieval_test_runs WHERE id = run_id AND user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'service_role'
  );

CREATE POLICY "Users can create case runs for their test runs" ON retrieval_test_case_runs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM retrieval_test_runs WHERE id = run_id AND user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Test Templates
ALTER TABLE retrieval_test_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view builtin templates and their own" ON retrieval_test_templates
  FOR SELECT USING (is_builtin = true OR user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can create their own templates" ON retrieval_test_templates
  FOR INSERT WITH CHECK ((user_id = auth.uid() AND is_builtin = false) OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can update their own templates" ON retrieval_test_templates
  FOR UPDATE USING ((user_id = auth.uid() AND is_builtin = false) OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can delete their own templates" ON retrieval_test_templates
  FOR DELETE USING ((user_id = auth.uid() AND is_builtin = false) OR auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get test suite statistics
CREATE OR REPLACE FUNCTION get_test_suite_stats(p_suite_id UUID)
RETURNS TABLE (
  total_cases BIGINT,
  active_cases BIGINT,
  last_run_passed BIGINT,
  last_run_failed BIGINT,
  pass_rate FLOAT,
  avg_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_cases,
    COUNT(*) FILTER (WHERE tc.is_active)::BIGINT as active_cases,
    COUNT(*) FILTER (WHERE tc.last_result = 'pass')::BIGINT as last_run_passed,
    COUNT(*) FILTER (WHERE tc.last_result = 'fail')::BIGINT as last_run_failed,
    CASE
      WHEN COUNT(*) FILTER (WHERE tc.last_result IS NOT NULL) > 0
      THEN COUNT(*) FILTER (WHERE tc.last_result = 'pass')::FLOAT /
           COUNT(*) FILTER (WHERE tc.last_result IS NOT NULL)::FLOAT
      ELSE NULL
    END as pass_rate,
    AVG(tc.last_score) as avg_score
  FROM retrieval_test_cases tc
  WHERE tc.suite_id = p_suite_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate run statistics
CREATE OR REPLACE FUNCTION calculate_test_run_stats(p_run_id UUID)
RETURNS TABLE (
  avg_score FLOAT,
  avg_latency_ms FLOAT,
  p50_latency_ms INT,
  p95_latency_ms INT,
  p99_latency_ms INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    AVG(tcr.relevance_score)::FLOAT as avg_score,
    AVG(tcr.latency_ms)::FLOAT as avg_latency_ms,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY tcr.latency_ms)::INT as p50_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tcr.latency_ms)::INT as p95_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY tcr.latency_ms)::INT as p99_latency_ms
  FROM retrieval_test_case_runs tcr
  WHERE tcr.run_id = p_run_id AND tcr.latency_ms IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Triggers
-- ============================================

-- Update suite timestamp on case change
CREATE OR REPLACE FUNCTION update_suite_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE retrieval_test_suites
  SET updated_at = NOW()
  WHERE id = NEW.suite_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_suite_timestamp
  AFTER INSERT OR UPDATE ON retrieval_test_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_suite_timestamp();

-- Update test case statistics after run
CREATE OR REPLACE FUNCTION update_test_case_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE retrieval_test_cases
  SET
    last_run_at = NOW(),
    last_result = NEW.result,
    last_score = NEW.relevance_score,
    last_latency_ms = NEW.latency_ms,
    last_retrieved_doc_ids = NEW.retrieved_doc_ids,
    last_error = NEW.error_message,
    run_count = run_count + 1,
    pass_count = pass_count + CASE WHEN NEW.result = 'pass' THEN 1 ELSE 0 END,
    fail_count = fail_count + CASE WHEN NEW.result = 'fail' THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = NEW.case_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_test_case_stats
  AFTER INSERT ON retrieval_test_case_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_test_case_stats();

-- Update run statistics after completion
CREATE OR REPLACE FUNCTION update_run_stats_on_complete()
RETURNS TRIGGER AS $$
DECLARE
  stats RECORD;
BEGIN
  IF NEW.status = 'completed' AND OLD.status = 'running' THEN
    SELECT * INTO stats FROM calculate_test_run_stats(NEW.id);

    UPDATE retrieval_test_runs
    SET
      avg_score = stats.avg_score,
      avg_latency_ms = stats.avg_latency_ms,
      p50_latency_ms = stats.p50_latency_ms,
      p95_latency_ms = stats.p95_latency_ms,
      p99_latency_ms = stats.p99_latency_ms,
      completed_at = NOW(),
      duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::INT * 1000
    WHERE id = NEW.id;

    -- Also update suite last run info
    UPDATE retrieval_test_suites
    SET
      last_run_at = NOW(),
      last_run_result = CASE
        WHEN NEW.failed = 0 THEN 'passed'
        WHEN NEW.passed = 0 THEN 'failed'
        ELSE 'partial'
      END,
      updated_at = NOW()
    WHERE id = NEW.suite_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_run_stats_on_complete
  AFTER UPDATE ON retrieval_test_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_run_stats_on_complete();

-- ============================================
-- Insert Default Templates
-- ============================================
INSERT INTO retrieval_test_templates (name, description, template_type, prompt_template, is_builtin) VALUES
(
  'Positive Test Generator',
  'Generates questions that should be answerable from the document',
  'positive',
  E'Based on the following document content, generate {{count}} test questions that a user might ask and that SHOULD be answerable from this document.\n\nDocument:\n{{content}}\n\nFor each question, also identify:\n1. Keywords that should appear in retrieved results\n2. The expected relevance score (0.7-1.0)\n\nOutput as JSON array: [{\"query\": \"...\", \"expected_keywords\": [...], \"min_score\": 0.8}]',
  true
),
(
  'Negative Test Generator',
  'Generates questions that should NOT be answerable from the document',
  'negative',
  E'Based on the following document content, generate {{count}} test questions that are related to the topic but CANNOT be answered from this document.\n\nDocument:\n{{content}}\n\nThese questions should test that the system correctly identifies when it lacks sufficient information.\n\nOutput as JSON array: [{\"query\": \"...\", \"expected_not_keywords\": [...]}]',
  true
),
(
  'Edge Case Generator',
  'Generates tricky or ambiguous questions',
  'edge_case',
  E'Based on the following document content, generate {{count}} edge case test questions:\n- Paraphrased versions of key information\n- Questions with synonyms instead of exact terms\n- Negation questions (\"what is NOT...\")\n- Questions that are almost but not quite answerable\n\nDocument:\n{{content}}\n\nOutput as JSON array: [{\"query\": \"...\", \"expected_keywords\": [...], \"test_type\": \"edge_case\", \"notes\": \"...\"}]',
  true
),
(
  'Multi-Document Test',
  'Tests retrieval across multiple documents',
  'custom',
  E'Generate {{count}} questions that require information from multiple documents to answer completely.\n\nDocuments:\n{{documents}}\n\nFocus on questions where:\n1. Partial info is in doc A, rest in doc B\n2. Documents have related but distinct information\n3. Cross-referencing is needed\n\nOutput as JSON array: [{\"query\": \"...\", \"expected_doc_ids\": [...], \"expected_keywords\": [...]}]',
  true
)
ON CONFLICT DO NOTHING;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE retrieval_test_suites IS 'Test suite definitions for retrieval regression testing';
COMMENT ON TABLE retrieval_test_cases IS 'Individual test cases within a test suite';
COMMENT ON TABLE retrieval_test_runs IS 'History of test suite executions';
COMMENT ON TABLE retrieval_test_case_runs IS 'Individual test case results for each run';
COMMENT ON TABLE retrieval_test_templates IS 'LLM prompt templates for test generation';

COMMENT ON COLUMN retrieval_test_cases.test_type IS 'positive=should retrieve relevant docs, negative=should not retrieve, edge_case=tricky scenarios';
COMMENT ON COLUMN retrieval_test_cases.expected_doc_ids IS 'Document IDs that should be in top results';
COMMENT ON COLUMN retrieval_test_cases.expected_keywords IS 'Keywords that should appear in retrieved content or generated answer';
COMMENT ON COLUMN retrieval_test_cases.expected_not_keywords IS 'Keywords that should NOT appear (for negative tests)';
