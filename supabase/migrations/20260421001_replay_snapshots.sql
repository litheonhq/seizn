CREATE TABLE IF NOT EXISTS replay_snapshots (
  trace_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  request_body jsonb NOT NULL,
  response_body jsonb NOT NULL,
  memory_reads jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory_writes jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  llm_seed bigint,
  llm_model text,
  llm_provider text,
  content_hash text NOT NULL,
  duration_ms int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS replay_snapshots_org_created_idx
  ON replay_snapshots (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS replay_snapshots_endpoint_idx
  ON replay_snapshots (organization_id, endpoint, created_at DESC);

ALTER TABLE replay_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS replay_snapshots_tenant_isolation ON replay_snapshots;
CREATE POLICY replay_snapshots_tenant_isolation
  ON replay_snapshots FOR SELECT
  USING (
    organization_id = (current_setting('app.current_organization_id', true))::uuid
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()::text
    )
  );
