BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1) Budget compatibility
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.retrieval_budgets (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_budget_usd DOUBLE PRECISION NOT NULL DEFAULT 10.0,
  monthly_budget_usd DOUBLE PRECISION NOT NULL DEFAULT 100.0,
  per_query_max_usd DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  alert_at_percent INTEGER NOT NULL DEFAULT 80,
  mode TEXT NOT NULL DEFAULT 'soft'
    CHECK (mode IN ('soft', 'hard')),
  fallback_strategy TEXT NOT NULL DEFAULT 'degrade'
    CHECK (fallback_strategy IN ('degrade', 'reject', 'queue')),
  daily_spent_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  monthly_spent_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_reset_daily TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reset_monthly TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.retrieval_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own retrieval_budgets" ON public.retrieval_budgets;
CREATE POLICY "Users can view own retrieval_budgets"
  ON public.retrieval_budgets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own retrieval_budgets" ON public.retrieval_budgets;
CREATE POLICY "Users can insert own retrieval_budgets"
  ON public.retrieval_budgets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own retrieval_budgets" ON public.retrieval_budgets;
CREATE POLICY "Users can update own retrieval_budgets"
  ON public.retrieval_budgets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.retrieval_budgets TO authenticated;
GRANT ALL ON public.retrieval_budgets TO service_role;

CREATE TABLE IF NOT EXISTS public.budget_degrade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  original_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  degraded_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  cost_saved_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_degrade_events_user_created
  ON public.budget_degrade_events(user_id, created_at DESC);

ALTER TABLE public.budget_degrade_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own budget_degrade_events" ON public.budget_degrade_events;
CREATE POLICY "Users can view own budget_degrade_events"
  ON public.budget_degrade_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own budget_degrade_events" ON public.budget_degrade_events;
CREATE POLICY "Users can insert own budget_degrade_events"
  ON public.budget_degrade_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.budget_degrade_events TO authenticated;
GRANT ALL ON public.budget_degrade_events TO service_role;

-- ============================================================================
-- 2) Fall / flight recorder compatibility
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fall_retrieval_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  collection_id UUID,
  collection_ids UUID[],
  query_text TEXT,
  query_hash TEXT,
  autopilot_reason TEXT,
  effective_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  timings_ms JSONB NOT NULL DEFAULT '{}'::JSONB,
  results_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  sampled BOOLEAN NOT NULL DEFAULT TRUE,
  experiment_id TEXT,
  arm_id TEXT,
  trace JSONB NOT NULL DEFAULT '{}'::JSONB,
  replay_of UUID REFERENCES public.fall_retrieval_traces(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_traces_user_created
  ON public.fall_retrieval_traces(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_traces_request
  ON public.fall_retrieval_traces(request_id);

CREATE INDEX IF NOT EXISTS idx_fall_traces_query_hash
  ON public.fall_retrieval_traces(query_hash)
  WHERE query_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fall_traces_collection_created
  ON public.fall_retrieval_traces(collection_id, created_at DESC)
  WHERE collection_id IS NOT NULL;

ALTER TABLE public.fall_retrieval_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own fall_retrieval_traces" ON public.fall_retrieval_traces;
CREATE POLICY "Users can view own fall_retrieval_traces"
  ON public.fall_retrieval_traces FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own fall_retrieval_traces" ON public.fall_retrieval_traces;
CREATE POLICY "Users can insert own fall_retrieval_traces"
  ON public.fall_retrieval_traces FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own fall_retrieval_traces" ON public.fall_retrieval_traces;
CREATE POLICY "Users can update own fall_retrieval_traces"
  ON public.fall_retrieval_traces FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own fall_retrieval_traces" ON public.fall_retrieval_traces;
CREATE POLICY "Users can delete own fall_retrieval_traces"
  ON public.fall_retrieval_traces FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fall_retrieval_traces TO authenticated;
GRANT ALL ON public.fall_retrieval_traces TO service_role;

DROP VIEW IF EXISTS public.flight_recorder_traces;
CREATE VIEW public.flight_recorder_traces AS
SELECT
  t.*,
  COALESCE(NULLIF((t.trace->'cost'->>'total'), '')::DOUBLE PRECISION, 0) AS cost_usd
FROM public.fall_retrieval_traces t;

ALTER VIEW public.flight_recorder_traces
  SET (security_invoker = true);

REVOKE ALL ON public.flight_recorder_traces FROM PUBLIC;
REVOKE ALL ON public.flight_recorder_traces FROM anon;
REVOKE ALL ON public.flight_recorder_traces FROM authenticated;
GRANT SELECT ON public.flight_recorder_traces TO service_role;

-- ============================================================================
-- 3) Search RPC compatibility
-- ============================================================================

CREATE OR REPLACE FUNCTION public.keyword_search_memories(
  query_text TEXT,
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  rank FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.tags,
    m.namespace,
    m.importance,
    (
      CASE
        WHEN COALESCE(query_text, '') = '' THEN 0::DOUBLE PRECISION
        WHEN POSITION(LOWER(query_text) IN LOWER(COALESCE(m.content, ''))) > 0 THEN
          1.0 / GREATEST(POSITION(LOWER(query_text) IN LOWER(COALESCE(m.content, ''))), 1)
        ELSE 0::DOUBLE PRECISION
      END
      + COALESCE(m.importance, 0)::DOUBLE PRECISION / 100.0
    ) AS rank,
    m.created_at
  FROM public.memories m
  WHERE m.user_id = match_user_id::UUID
    AND COALESCE(m.is_deleted, FALSE) = FALSE
    AND COALESCE(m.is_encrypted, FALSE) = FALSE
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND COALESCE(query_text, '') <> ''
    AND COALESCE(m.content, '') ILIKE '%' || query_text || '%'
  ORDER BY rank DESC, m.created_at DESC
  LIMIT GREATEST(match_count, 0);
$$;

CREATE OR REPLACE FUNCTION public.search_memories(
  query_embedding VECTOR(1024),
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.tags,
    m.namespace,
    m.importance,
    1 - (m.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity,
    m.created_at
  FROM public.memories m
  WHERE m.user_id = match_user_id::UUID
    AND COALESCE(m.is_deleted, FALSE) = FALSE
    AND COALESCE(m.is_encrypted, FALSE) = FALSE
    AND m.embedding IS NOT NULL
    AND query_embedding IS NOT NULL
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND 1 - (m.embedding OPERATOR(extensions.<=>) query_embedding) > COALESCE(match_threshold, 0)
  ORDER BY m.embedding OPERATOR(extensions.<=>) query_embedding, m.created_at DESC
  LIMIT GREATEST(match_count, 0);
$$;

CREATE OR REPLACE FUNCTION public.hybrid_search_memories(
  query_text TEXT,
  query_embedding VECTOR(1024),
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  match_namespace TEXT DEFAULT NULL,
  keyword_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  keyword_rank FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vector_results AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.tags,
      m.namespace,
      m.importance,
      1 - (m.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
    FROM public.memories m
    WHERE m.user_id = match_user_id::UUID
      AND COALESCE(m.is_deleted, FALSE) = FALSE
      AND COALESCE(m.is_encrypted, FALSE) = FALSE
      AND m.embedding IS NOT NULL
      AND query_embedding IS NOT NULL
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND 1 - (m.embedding OPERATOR(extensions.<=>) query_embedding) > COALESCE(match_threshold, 0)
    ORDER BY m.embedding OPERATOR(extensions.<=>) query_embedding, m.created_at DESC
    LIMIT GREATEST(match_count, 1) * 2
  ),
  keyword_results AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.tags,
      m.namespace,
      m.importance,
      CASE
        WHEN COALESCE(query_text, '') = '' THEN 0::DOUBLE PRECISION
        WHEN POSITION(LOWER(query_text) IN LOWER(COALESCE(m.content, ''))) > 0 THEN
          1.0 / GREATEST(POSITION(LOWER(query_text) IN LOWER(COALESCE(m.content, ''))), 1)
        ELSE 0::DOUBLE PRECISION
      END AS keyword_rank
    FROM public.memories m
    WHERE m.user_id = match_user_id::UUID
      AND COALESCE(m.is_deleted, FALSE) = FALSE
      AND COALESCE(m.is_encrypted, FALSE) = FALSE
      AND (match_namespace IS NULL OR m.namespace = match_namespace)
      AND (
        COALESCE(query_text, '') = ''
        OR COALESCE(m.content, '') ILIKE '%' || query_text || '%'
      )
    ORDER BY keyword_rank DESC, m.created_at DESC
    LIMIT GREATEST(match_count, 1) * 2
  ),
  combined AS (
    SELECT
      COALESCE(v.id, k.id) AS id,
      COALESCE(v.content, k.content) AS content,
      COALESCE(v.memory_type, k.memory_type) AS memory_type,
      COALESCE(v.tags, k.tags) AS tags,
      COALESCE(v.namespace, k.namespace) AS namespace,
      COALESCE(v.importance, k.importance) AS importance,
      COALESCE(v.similarity, 0) AS similarity,
      COALESCE(k.keyword_rank, 0) AS keyword_rank,
      (
        COALESCE(vector_weight, 0.7) * COALESCE(v.similarity, 0)
        + COALESCE(keyword_weight, 0.3) * COALESCE(k.keyword_rank, 0)
      ) AS combined_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results k ON k.id = v.id
  )
  SELECT
    c.id,
    c.content,
    c.memory_type,
    c.tags,
    c.namespace,
    c.importance,
    c.similarity,
    c.keyword_rank,
    c.combined_score,
    m.created_at
  FROM combined c
  JOIN public.memories m ON m.id = c.id
  ORDER BY c.combined_score DESC, m.created_at DESC
  LIMIT GREATEST(match_count, 0);
$$;

CREATE OR REPLACE FUNCTION public.keyword_search_memories_bounded(
  query_text TEXT,
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_namespace TEXT DEFAULT NULL,
  statement_timeout_ms INT DEFAULT 400
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  rank FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF statement_timeout_ms IS NOT NULL AND statement_timeout_ms > 0 THEN
    PERFORM set_config('statement_timeout', statement_timeout_ms::TEXT, TRUE);
  END IF;

  RETURN QUERY
  SELECT * FROM public.keyword_search_memories(
    query_text,
    match_user_id,
    match_count,
    match_namespace
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.search_memories_bounded(
  query_embedding VECTOR(1024),
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  match_namespace TEXT DEFAULT NULL,
  statement_timeout_ms INT DEFAULT 400
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF statement_timeout_ms IS NOT NULL AND statement_timeout_ms > 0 THEN
    PERFORM set_config('statement_timeout', statement_timeout_ms::TEXT, TRUE);
  END IF;

  RETURN QUERY
  SELECT * FROM public.search_memories(
    query_embedding,
    match_user_id,
    match_count,
    match_threshold,
    match_namespace
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hybrid_search_memories_bounded(
  query_text TEXT,
  query_embedding VECTOR(1024),
  match_user_id TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  match_namespace TEXT DEFAULT NULL,
  keyword_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.7,
  statement_timeout_ms INT DEFAULT 400
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  keyword_rank FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF statement_timeout_ms IS NOT NULL AND statement_timeout_ms > 0 THEN
    PERFORM set_config('statement_timeout', statement_timeout_ms::TEXT, TRUE);
  END IF;

  RETURN QUERY
  SELECT * FROM public.hybrid_search_memories(
    query_text,
    query_embedding,
    match_user_id,
    match_count,
    match_threshold,
    match_namespace,
    keyword_weight,
    vector_weight
  );
END;
$$;

-- ============================================================================
-- 4) Auto-PR compatibility
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auto_pr_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trace_id UUID REFERENCES public.fall_retrieval_traces(id) ON DELETE SET NULL,
  collection_id UUID,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),
  issues JSONB NOT NULL DEFAULT '[]'::JSONB,
  suggestions JSONB NOT NULL DEFAULT '[]'::JSONB,
  summary JSONB,
  error TEXT,
  error_details JSONB,
  analysis JSONB NOT NULL DEFAULT '{}'::JSONB,
  issues_count INTEGER NOT NULL DEFAULT 0,
  suggestions_count INTEGER NOT NULL DEFAULT 0,
  quality_score DOUBLE PRECISION,
  confidence DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_pr_analyses_user
  ON public.auto_pr_analyses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_pr_analyses_trace
  ON public.auto_pr_analyses(trace_id)
  WHERE trace_id IS NOT NULL;

ALTER TABLE public.auto_pr_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own auto_pr_analyses" ON public.auto_pr_analyses;
CREATE POLICY "Users can view own auto_pr_analyses"
  ON public.auto_pr_analyses FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own auto_pr_analyses" ON public.auto_pr_analyses;
CREATE POLICY "Users can insert own auto_pr_analyses"
  ON public.auto_pr_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own auto_pr_analyses" ON public.auto_pr_analyses;
CREATE POLICY "Users can update own auto_pr_analyses"
  ON public.auto_pr_analyses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own auto_pr_analyses" ON public.auto_pr_analyses;
CREATE POLICY "Users can delete own auto_pr_analyses"
  ON public.auto_pr_analyses FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_pr_analyses TO authenticated;
GRANT ALL ON public.auto_pr_analyses TO service_role;

CREATE TABLE IF NOT EXISTS public.auto_pr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.auto_pr_analyses(id) ON DELETE SET NULL,
  pr_number INTEGER,
  pr_url TEXT,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch_name TEXT,
  head_branch TEXT,
  base_branch TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'merged', 'closed', 'superseded')),
  title TEXT NOT NULL,
  body TEXT,
  files_changed INTEGER NOT NULL DEFAULT 0,
  suggestions_applied JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  review_status TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  merged_at TIMESTAMPTZ,
  merged_by TEXT,
  merge_commit_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_pr_records_user
  ON public.auto_pr_records(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_pr_records_analysis
  ON public.auto_pr_records(analysis_id)
  WHERE analysis_id IS NOT NULL;

ALTER TABLE public.auto_pr_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own auto_pr_records" ON public.auto_pr_records;
CREATE POLICY "Users can view own auto_pr_records"
  ON public.auto_pr_records FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own auto_pr_records" ON public.auto_pr_records;
CREATE POLICY "Users can insert own auto_pr_records"
  ON public.auto_pr_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own auto_pr_records" ON public.auto_pr_records;
CREATE POLICY "Users can update own auto_pr_records"
  ON public.auto_pr_records FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own auto_pr_records" ON public.auto_pr_records;
CREATE POLICY "Users can delete own auto_pr_records"
  ON public.auto_pr_records FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_pr_records TO authenticated;
GRANT ALL ON public.auto_pr_records TO service_role;

-- ============================================================================
-- 5) Autopilot compatibility
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.autopilot_configs (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  github_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.autopilot_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own autopilot_configs" ON public.autopilot_configs;
CREATE POLICY "Users can view own autopilot_configs"
  ON public.autopilot_configs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own autopilot_configs" ON public.autopilot_configs;
CREATE POLICY "Users can upsert own autopilot_configs"
  ON public.autopilot_configs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_configs TO authenticated;
GRANT ALL ON public.autopilot_configs TO service_role;

CREATE TABLE IF NOT EXISTS public.autopilot_webhooks (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  repository TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_autopilot_webhooks_repo_created
  ON public.autopilot_webhooks(repository, created_at DESC);

ALTER TABLE public.autopilot_webhooks ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.autopilot_webhooks TO service_role;

CREATE TABLE IF NOT EXISTS public.autopilot_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  collection_id UUID,
  trace_id UUID REFERENCES public.fall_retrieval_traces(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL DEFAULT 'retrieval_quality',
  status TEXT NOT NULL DEFAULT 'pending',
  input_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  findings JSONB NOT NULL DEFAULT '[]'::JSONB,
  recommendations JSONB NOT NULL DEFAULT '[]'::JSONB,
  confidence_score DOUBLE PRECISION,
  severity TEXT,
  error TEXT,
  analysis JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_analyses_user
  ON public.autopilot_analyses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_analyses_user_trace
  ON public.autopilot_analyses(user_id, trace_id)
  WHERE trace_id IS NOT NULL;

ALTER TABLE public.autopilot_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own autopilot_analyses" ON public.autopilot_analyses;
CREATE POLICY "Users can view own autopilot_analyses"
  ON public.autopilot_analyses FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own autopilot_analyses" ON public.autopilot_analyses;
CREATE POLICY "Users can insert own autopilot_analyses"
  ON public.autopilot_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own autopilot_analyses" ON public.autopilot_analyses;
CREATE POLICY "Users can update own autopilot_analyses"
  ON public.autopilot_analyses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.autopilot_analyses TO authenticated;
GRANT ALL ON public.autopilot_analyses TO service_role;

CREATE TABLE IF NOT EXISTS public.autopilot_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES public.autopilot_analyses(id) ON DELETE CASCADE,
  trace_id UUID REFERENCES public.fall_retrieval_traces(id) ON DELETE SET NULL,
  pr_id UUID,
  fix_type TEXT NOT NULL DEFAULT 'config_change',
  status TEXT NOT NULL DEFAULT 'proposed',
  target_type TEXT NOT NULL DEFAULT 'config',
  target_id UUID,
  description TEXT,
  before_state JSONB,
  after_state JSONB,
  changes JSONB NOT NULL DEFAULT '{}'::JSONB,
  estimated_impact JSONB,
  pr_context JSONB,
  applied_suggestions JSONB NOT NULL DEFAULT '[]'::JSONB,
  auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  is_rollback_available BOOLEAN NOT NULL DEFAULT TRUE,
  rolled_back_at TIMESTAMPTZ,
  rollback_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_fixes_user
  ON public.autopilot_fixes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_fixes_user_trace_created
  ON public.autopilot_fixes(user_id, trace_id, created_at DESC)
  WHERE trace_id IS NOT NULL;

ALTER TABLE public.autopilot_fixes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own autopilot_fixes" ON public.autopilot_fixes;
CREATE POLICY "Users can view own autopilot_fixes"
  ON public.autopilot_fixes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own autopilot_fixes" ON public.autopilot_fixes;
CREATE POLICY "Users can insert own autopilot_fixes"
  ON public.autopilot_fixes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own autopilot_fixes" ON public.autopilot_fixes;
CREATE POLICY "Users can update own autopilot_fixes"
  ON public.autopilot_fixes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.autopilot_fixes TO authenticated;
GRANT ALL ON public.autopilot_fixes TO service_role;

CREATE TABLE IF NOT EXISTS public.autopilot_prs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.autopilot_analyses(id) ON DELETE SET NULL,
  fix_id UUID REFERENCES public.autopilot_fixes(id) ON DELETE SET NULL,
  trace_id UUID REFERENCES public.fall_retrieval_traces(id) ON DELETE SET NULL,
  pr_type TEXT NOT NULL DEFAULT 'config_update',
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  description TEXT,
  files_changed JSONB NOT NULL DEFAULT '[]'::JSONB,
  external_provider TEXT,
  external_pr_id TEXT,
  external_pr_url TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  context JSONB,
  history JSONB NOT NULL DEFAULT '[]'::JSONB,
  github_response JSONB,
  error TEXT,
  review_status TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  merged_at TIMESTAMPTZ,
  merged_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_prs_user
  ON public.autopilot_prs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autopilot_prs_user_pr_number
  ON public.autopilot_prs(user_id, pr_number)
  WHERE pr_number IS NOT NULL;

ALTER TABLE public.autopilot_prs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own autopilot_prs" ON public.autopilot_prs;
CREATE POLICY "Users can view own autopilot_prs"
  ON public.autopilot_prs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own autopilot_prs" ON public.autopilot_prs;
CREATE POLICY "Users can insert own autopilot_prs"
  ON public.autopilot_prs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own autopilot_prs" ON public.autopilot_prs;
CREATE POLICY "Users can update own autopilot_prs"
  ON public.autopilot_prs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.autopilot_prs TO authenticated;
GRANT ALL ON public.autopilot_prs TO service_role;

CREATE OR REPLACE FUNCTION public.update_runtime_compat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_retrieval_budgets_updated ON public.retrieval_budgets;
CREATE TRIGGER trigger_retrieval_budgets_updated
  BEFORE UPDATE ON public.retrieval_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_runtime_compat_updated_at();

DROP TRIGGER IF EXISTS trigger_auto_pr_analyses_updated ON public.auto_pr_analyses;
CREATE TRIGGER trigger_auto_pr_analyses_updated
  BEFORE UPDATE ON public.auto_pr_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_runtime_compat_updated_at();

DROP TRIGGER IF EXISTS trigger_auto_pr_records_updated ON public.auto_pr_records;
CREATE TRIGGER trigger_auto_pr_records_updated
  BEFORE UPDATE ON public.auto_pr_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_runtime_compat_updated_at();

DROP TRIGGER IF EXISTS trigger_autopilot_configs_updated ON public.autopilot_configs;
CREATE TRIGGER trigger_autopilot_configs_updated
  BEFORE UPDATE ON public.autopilot_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_runtime_compat_updated_at();

DROP TRIGGER IF EXISTS trigger_autopilot_analyses_updated ON public.autopilot_analyses;
CREATE TRIGGER trigger_autopilot_analyses_updated
  BEFORE UPDATE ON public.autopilot_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_runtime_compat_updated_at();

DROP TRIGGER IF EXISTS trigger_autopilot_fixes_updated ON public.autopilot_fixes;
CREATE TRIGGER trigger_autopilot_fixes_updated
  BEFORE UPDATE ON public.autopilot_fixes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_runtime_compat_updated_at();

DROP TRIGGER IF EXISTS trigger_autopilot_prs_updated ON public.autopilot_prs;
CREATE TRIGGER trigger_autopilot_prs_updated
  BEFORE UPDATE ON public.autopilot_prs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_runtime_compat_updated_at();

NOTIFY pgrst, 'reload schema';

COMMIT;
