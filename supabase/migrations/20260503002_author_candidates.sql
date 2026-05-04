-- Seizn Author Memory v3 - persistent candidate rows

CREATE TABLE IF NOT EXISTS author_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'character', 'world_rule', 'event', 'relationship', 'voice_sample', 'fact'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'candidate', 'canon', 'rejected', 'retired',
    'past_only', 'contradicted', 'invalidated',
    'author_only', 'character_known', 'character_unknown'
  )),
  suggested_status TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source JSONB NOT NULL,
  related_existing JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_entity_id TEXT,
  decision_id UUID,
  promoted_entity_id TEXT,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_author_candidates_user_project_status
  ON author_candidates(user_id, project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_author_candidates_decision
  ON author_candidates(user_id, decision_id) WHERE decision_id IS NOT NULL;

ALTER TABLE author_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_candidates'
      AND policyname = 'Users can read own author_candidates'
  ) THEN
    CREATE POLICY "Users can read own author_candidates"
      ON author_candidates FOR SELECT
      USING (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_candidates'
      AND policyname = 'Users can insert own author_candidates'
  ) THEN
    CREATE POLICY "Users can insert own author_candidates"
      ON author_candidates FOR INSERT
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_candidates'
      AND policyname = 'Users can update own author_candidates'
  ) THEN
    CREATE POLICY "Users can update own author_candidates"
      ON author_candidates FOR UPDATE
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_candidates'
      AND policyname = 'Users can delete own author_candidates'
  ) THEN
    CREATE POLICY "Users can delete own author_candidates"
      ON author_candidates FOR DELETE
      USING (auth.uid()::TEXT = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_author_candidates_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_author_candidates_set_updated_at
      BEFORE UPDATE ON author_candidates
      FOR EACH ROW EXECUTE FUNCTION public.set_author_updated_at();
  END IF;
END $$;
