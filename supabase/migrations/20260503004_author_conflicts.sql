-- Seizn Author Memory v3 - persistent conflict rows

CREATE TABLE IF NOT EXISTS author_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  conflict_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  payload JSONB NOT NULL,
  resolution JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, conflict_key)
);

CREATE INDEX IF NOT EXISTS idx_author_conflicts_user_project_status
  ON author_conflicts(user_id, project_id, status);

ALTER TABLE author_conflicts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_conflicts'
      AND policyname = 'Users can read own author_conflicts'
  ) THEN
    CREATE POLICY "Users can read own author_conflicts"
      ON author_conflicts FOR SELECT
      USING (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_conflicts'
      AND policyname = 'Users can insert own author_conflicts'
  ) THEN
    CREATE POLICY "Users can insert own author_conflicts"
      ON author_conflicts FOR INSERT
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_conflicts'
      AND policyname = 'Users can update own author_conflicts'
  ) THEN
    CREATE POLICY "Users can update own author_conflicts"
      ON author_conflicts FOR UPDATE
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_conflicts'
      AND policyname = 'Users can delete own author_conflicts'
  ) THEN
    CREATE POLICY "Users can delete own author_conflicts"
      ON author_conflicts FOR DELETE
      USING (auth.uid()::TEXT = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_author_conflicts_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_author_conflicts_set_updated_at
      BEFORE UPDATE ON author_conflicts
      FOR EACH ROW EXECUTE FUNCTION public.set_author_updated_at();
  END IF;
END $$;
