-- Seizn Fall - Observability (Retrieval Flight Recorder + Feedback)
-- Migration: 022_fall_observability.sql

-- Notes
-- - Depends on 021_summer_schema.sql (summer_collections, summer_chunks)
-- - Stores structured trace JSON for debugging + offline evaluation

-- ===========================================
-- 1) Retrieval traces (one row per retrieval request)
-- ===========================================
CREATE TABLE IF NOT EXISTS fall_retrieval_traces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- client-visible request id (UUID)
  request_id UUID NOT NULL,

  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  api_key_id UUID NULL REFERENCES api_keys(id) ON DELETE SET NULL,
  plan TEXT NOT NULL DEFAULT 'free',

  -- Primary collection (MVP)
  collection_id UUID NULL REFERENCES summer_collections(id) ON DELETE SET NULL,
  -- Multi-collection / federated (future)
  collection_ids UUID[] NULL,

  -- Query: store text optionally + always store hash for analytics joins
  query_text TEXT NULL,
  query_hash TEXT NULL,

  -- Autopilot + config snapshot
  autopilot_reason TEXT NULL,
  effective_config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Timings and counts
  timings_ms JSONB NOT NULL DEFAULT '{}'::JSONB,
  results_count INT NOT NULL DEFAULT 0,

  -- Error info (if any)
  error TEXT NULL,

  -- Full structured trace (events, candidates, rerank deltas, context, etc.)
  trace JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Sampling (to control storage cost)
  sampled BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_traces_user_created
ON fall_retrieval_traces(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_traces_request
ON fall_retrieval_traces(request_id);

CREATE INDEX IF NOT EXISTS idx_fall_traces_collection_created
ON fall_retrieval_traces(collection_id, created_at DESC);

-- ===========================================
-- 2) Online feedback events (click/accept/like, etc.)
-- ===========================================
CREATE TABLE IF NOT EXISTS fall_retrieval_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  trace_id UUID NULL REFERENCES fall_retrieval_traces(id) ON DELETE SET NULL,
  request_id UUID NULL,

  event_type TEXT NOT NULL, -- e.g. click, accept, copy, thumb_up, thumb_down
  chunk_id UUID NULL REFERENCES summer_chunks(id) ON DELETE SET NULL,

  value FLOAT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fall_feedback_user_created
ON fall_retrieval_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_feedback_trace
ON fall_retrieval_feedback(trace_id);

-- ===========================================
-- 3) RLS (optional but recommended)
-- ===========================================
ALTER TABLE fall_retrieval_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_retrieval_feedback ENABLE ROW LEVEL SECURITY;

-- Traces
CREATE POLICY "Users can view own fall_retrieval_traces"
  ON fall_retrieval_traces FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own fall_retrieval_traces"
  ON fall_retrieval_traces FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

-- Feedback
CREATE POLICY "Users can view own fall_retrieval_feedback"
  ON fall_retrieval_feedback FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own fall_retrieval_feedback"
  ON fall_retrieval_feedback FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);
