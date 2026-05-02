-- Seizn Author Memory v3 - parsed import text store
-- Persists extracted text and source object metadata for Author UI imports.

CREATE TABLE IF NOT EXISTS author_imports_text (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  content_type TEXT NULL,

  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  storage_endpoint TEXT NOT NULL,
  storage_owner TEXT NOT NULL DEFAULT 'personal_temp',
  storage_migrate_by TEXT NULL,

  parsed_text TEXT NOT NULL,
  heading_structure JSONB NOT NULL DEFAULT '[]'::JSONB,
  page_spans JSONB NOT NULL DEFAULT '[]'::JSONB,
  parser_version TEXT NOT NULL,
  parser_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT author_imports_text_unique UNIQUE (user_id, project_id, import_id)
);

CREATE INDEX IF NOT EXISTS idx_author_imports_text_project
ON author_imports_text(user_id, project_id, parsed_at DESC);

CREATE INDEX IF NOT EXISTS idx_author_imports_text_storage_key
ON author_imports_text(storage_bucket, storage_key);

ALTER TABLE author_imports_text ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_imports_text'
      AND policyname = 'Users can manage own author_imports_text'
  ) THEN
    CREATE POLICY "Users can manage own author_imports_text"
      ON author_imports_text FOR ALL
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;
END $$;
