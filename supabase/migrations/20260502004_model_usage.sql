-- Seizn Author Memory v3 - LLM model usage ledger
-- Tracks Anthropic token usage for BYOK and dev-managed Author calls.

CREATE TABLE IF NOT EXISTS model_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic')),
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost_usd NUMERIC(10, 6),
  byok BOOLEAN NOT NULL DEFAULT FALSE,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_usage_user_date
ON model_usage(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_usage_project_date
ON model_usage(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_usage_request
ON model_usage(request_id)
WHERE request_id IS NOT NULL;

ALTER TABLE model_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'model_usage'
      AND policyname = 'Users can view own model_usage'
  ) THEN
    CREATE POLICY "Users can view own model_usage"
      ON model_usage FOR SELECT
      USING (auth.uid()::TEXT = user_id);
  END IF;
END $$;
