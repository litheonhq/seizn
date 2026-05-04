-- Seizn Author Memory v3 - persistent import rows

CREATE OR REPLACE FUNCTION public.set_author_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS author_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN (
    'md', 'docx', 'pdf', 'txt', 'json', 'notion_export', 'obsidian_md'
  )),
  source_role TEXT NOT NULL CHECK (source_role IN (
    'canon', 'character', 'scene', 'reference', 'visual'
  )),
  a_or_d_mode TEXT NOT NULL CHECK (a_or_d_mode IN ('extract', 'raw_keep')),
  parse_status TEXT NOT NULL CHECK (parse_status IN (
    'queued', 'parsing', 'parsed', 'failed'
  )),
  parse_progress NUMERIC NOT NULL DEFAULT 0,
  extract_status TEXT NOT NULL CHECK (extract_status IN (
    'queued', 'extracting', 'extracted', 'failed'
  )),
  extract_progress NUMERIC NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  storage_key TEXT,
  parsed_text_preview TEXT,
  parser_version TEXT,
  upload_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_author_imports_user_project_created
  ON author_imports(user_id, project_id, created_at DESC);

ALTER TABLE author_imports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_imports'
      AND policyname = 'Users can read own author_imports'
  ) THEN
    CREATE POLICY "Users can read own author_imports"
      ON author_imports FOR SELECT
      USING (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_imports'
      AND policyname = 'Users can insert own author_imports'
  ) THEN
    CREATE POLICY "Users can insert own author_imports"
      ON author_imports FOR INSERT
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_imports'
      AND policyname = 'Users can update own author_imports'
  ) THEN
    CREATE POLICY "Users can update own author_imports"
      ON author_imports FOR UPDATE
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_imports'
      AND policyname = 'Users can delete own author_imports'
  ) THEN
    CREATE POLICY "Users can delete own author_imports"
      ON author_imports FOR DELETE
      USING (auth.uid()::TEXT = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_author_imports_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_author_imports_set_updated_at
      BEFORE UPDATE ON author_imports
      FOR EACH ROW EXECUTE FUNCTION public.set_author_updated_at();
  END IF;
END $$;
