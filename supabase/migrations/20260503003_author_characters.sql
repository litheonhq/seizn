-- Seizn Author Memory v3 - persistent character rows

CREATE TABLE IF NOT EXISTS author_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  scope TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  archetype TEXT NOT NULL DEFAULT '',
  voice JSONB NOT NULL DEFAULT '{}'::jsonb,
  persona JSONB NOT NULL DEFAULT '{}'::jsonb,
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  background JSONB NOT NULL DEFAULT '{}'::jsonb,
  knowledge_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  relationships JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_important_memories JSONB NOT NULL DEFAULT '[]'::jsonb,
  voice_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_arc_phase TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, character_key)
);

CREATE INDEX IF NOT EXISTS idx_author_characters_user_project
  ON author_characters(user_id, project_id);

ALTER TABLE author_characters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_characters'
      AND policyname = 'Users can read own author_characters'
  ) THEN
    CREATE POLICY "Users can read own author_characters"
      ON author_characters FOR SELECT
      USING (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_characters'
      AND policyname = 'Users can insert own author_characters'
  ) THEN
    CREATE POLICY "Users can insert own author_characters"
      ON author_characters FOR INSERT
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_characters'
      AND policyname = 'Users can update own author_characters'
  ) THEN
    CREATE POLICY "Users can update own author_characters"
      ON author_characters FOR UPDATE
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_characters'
      AND policyname = 'Users can delete own author_characters'
  ) THEN
    CREATE POLICY "Users can delete own author_characters"
      ON author_characters FOR DELETE
      USING (auth.uid()::TEXT = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_author_characters_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_author_characters_set_updated_at
      BEFORE UPDATE ON author_characters
      FOR EACH ROW EXECUTE FUNCTION public.set_author_updated_at();
  END IF;
END $$;
