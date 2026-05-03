-- Seizn Author Memory v3 - persistent simulation rows

CREATE TABLE IF NOT EXISTS author_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  simulation_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  progress NUMERIC NOT NULL DEFAULT 0,
  input JSONB NOT NULL,
  context_used JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  trace_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_meta JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, simulation_key)
);

CREATE INDEX IF NOT EXISTS idx_author_simulations_user_project_created
  ON author_simulations(user_id, project_id, created_at DESC);

ALTER TABLE author_simulations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_simulations'
      AND policyname = 'Users can read own author_simulations'
  ) THEN
    CREATE POLICY "Users can read own author_simulations"
      ON author_simulations FOR SELECT
      USING (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_simulations'
      AND policyname = 'Users can insert own author_simulations'
  ) THEN
    CREATE POLICY "Users can insert own author_simulations"
      ON author_simulations FOR INSERT
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_simulations'
      AND policyname = 'Users can update own author_simulations'
  ) THEN
    CREATE POLICY "Users can update own author_simulations"
      ON author_simulations FOR UPDATE
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_simulations'
      AND policyname = 'Users can delete own author_simulations'
  ) THEN
    CREATE POLICY "Users can delete own author_simulations"
      ON author_simulations FOR DELETE
      USING (auth.uid()::TEXT = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_author_simulations_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_author_simulations_set_updated_at
      BEFORE UPDATE ON author_simulations
      FOR EACH ROW EXECUTE FUNCTION public.set_author_updated_at();
  END IF;
END $$;
