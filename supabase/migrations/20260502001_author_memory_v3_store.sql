-- Seizn Author Memory v3 - persistent store
-- Stores author-canon records, snapshots, replay side effects, and eval results.

CREATE TABLE IF NOT EXISTS author_memory_v3_records (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  record_id TEXT NOT NULL,

  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  entity_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  valid_at TIMESTAMPTZ NULL,
  invalid_at TIMESTAMPTZ NULL,
  content TEXT NOT NULL,
  record_payload JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, project_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_author_memory_v3_records_project
ON author_memory_v3_records(user_id, project_id, kind, status);

CREATE INDEX IF NOT EXISTS idx_author_memory_v3_records_entity_ids
ON author_memory_v3_records USING GIN(entity_ids);

CREATE TABLE IF NOT EXISTS author_memory_v3_snapshots (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,

  item_count INTEGER NOT NULL,
  snapshot_payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, project_id, snapshot_hash)
);

CREATE INDEX IF NOT EXISTS idx_author_memory_v3_snapshots_project
ON author_memory_v3_snapshots(user_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS author_memory_v3_side_effects (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  project_id TEXT NULL,

  side_effect_payload JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_author_memory_v3_side_effects_project
ON author_memory_v3_side_effects(user_id, project_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS author_memory_v3_eval_results (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,

  result_payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, project_id, id)
);

CREATE INDEX IF NOT EXISTS idx_author_memory_v3_eval_results_run
ON author_memory_v3_eval_results(user_id, project_id, run_id, created_at DESC);

ALTER TABLE author_memory_v3_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE author_memory_v3_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE author_memory_v3_side_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE author_memory_v3_eval_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_memory_v3_records'
      AND policyname = 'Users can manage own author_memory_v3_records'
  ) THEN
    CREATE POLICY "Users can manage own author_memory_v3_records"
      ON author_memory_v3_records FOR ALL
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_memory_v3_snapshots'
      AND policyname = 'Users can manage own author_memory_v3_snapshots'
  ) THEN
    CREATE POLICY "Users can manage own author_memory_v3_snapshots"
      ON author_memory_v3_snapshots FOR ALL
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_memory_v3_side_effects'
      AND policyname = 'Users can manage own author_memory_v3_side_effects'
  ) THEN
    CREATE POLICY "Users can manage own author_memory_v3_side_effects"
      ON author_memory_v3_side_effects FOR ALL
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_memory_v3_eval_results'
      AND policyname = 'Users can manage own author_memory_v3_eval_results'
  ) THEN
    CREATE POLICY "Users can manage own author_memory_v3_eval_results"
      ON author_memory_v3_eval_results FOR ALL
      USING (auth.uid()::TEXT = user_id)
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;
END $$;
