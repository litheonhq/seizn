-- Seizn Author Memory v3 - persistent audit log and replay chain

CREATE TABLE IF NOT EXISTS author_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'project.created',
    'import.upload',
    'import.parsed',
    'import.failed',
    'import.retried',
    'import.deleted',
    'candidate.added',
    'candidate.decided',
    'candidate.batch_decided',
    'character.updated',
    'conflict.resolved',
    'simulation.run',
    'simulation.replay',
    'backlog.generated',
    'settings.updated',
    'byok.updated'
  )),
  payload JSONB NOT NULL,
  llm_meta JSONB,
  source_span JSONB,
  decision_id UUID NOT NULL UNIQUE,
  parent_decision_id UUID REFERENCES author_audit_log(decision_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_author_audit_project_event
ON author_audit_log(user_id, project_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_author_audit_decision
ON author_audit_log(user_id, decision_id);

CREATE INDEX IF NOT EXISTS idx_author_audit_payload_gin
ON author_audit_log USING GIN(payload);

ALTER TABLE author_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_audit_log'
      AND policyname = 'Users can read own author_audit_log'
  ) THEN
    CREATE POLICY "Users can read own author_audit_log"
      ON author_audit_log FOR SELECT
      USING (auth.uid()::TEXT = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_audit_log'
      AND policyname = 'Users can insert own author_audit_log'
  ) THEN
    CREATE POLICY "Users can insert own author_audit_log"
      ON author_audit_log FOR INSERT
      WITH CHECK (auth.uid()::TEXT = user_id);
  END IF;
END $$;
