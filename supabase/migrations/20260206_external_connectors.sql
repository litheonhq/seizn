-- External Connectors Migration
--
-- Provides infrastructure for syncing external sources (Google Drive, Notion, GitHub)
-- to Spring Memory notes.

-- =============================================================================
-- 1. External Connections Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS external_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Connector identification
  connector_type VARCHAR(30) NOT NULL CHECK (connector_type IN (
    'google_drive',
    'notion',
    'github',
    'slack',
    'confluence',
    'linear',
    'jira'
  )),
  connection_name TEXT,  -- User-friendly name

  -- OAuth tokens (encrypted at rest via Supabase)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  token_scope TEXT,  -- OAuth scopes granted

  -- Account information
  account_id TEXT,  -- External account ID
  account_email TEXT,
  account_info JSONB DEFAULT '{}',

  -- Sync configuration
  sync_config JSONB DEFAULT '{
    "auto_sync": true,
    "sync_interval_hours": 24,
    "include_patterns": [],
    "exclude_patterns": [],
    "max_items_per_sync": 100
  }',

  -- Sync state
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(20) DEFAULT 'pending',
  last_sync_error TEXT,
  sync_cursor TEXT,  -- For incremental sync (e.g., page token, change token)

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'paused',
    'error',
    'revoked',
    'expired'
  )),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique connection per user per type (can have multiple with different names)
  UNIQUE(user_id, connector_type, account_id)
);

-- =============================================================================
-- 2. External Sync Items Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS external_sync_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,

  -- External item identification
  external_id TEXT NOT NULL,  -- ID in external system
  external_parent_id TEXT,    -- Parent folder/page ID
  external_path TEXT,         -- Full path in external system

  -- Item metadata
  title TEXT,
  mime_type TEXT,
  source_url TEXT,
  external_created_at TIMESTAMPTZ,
  external_modified_at TIMESTAMPTZ,

  -- Sync state
  content_hash TEXT,  -- SHA256 of content for change detection
  memory_id UUID REFERENCES spring_memory_notes(id) ON DELETE SET NULL,
  sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN (
    'pending',
    'synced',
    'error',
    'skipped',
    'deleted'
  )),
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique item per connection
  UNIQUE(connection_id, external_id)
);

-- =============================================================================
-- 3. Sync History Table (for auditing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS external_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,

  -- Sync run info
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN (
    'running',
    'completed',
    'failed',
    'cancelled'
  )),

  -- Statistics
  items_found INT DEFAULT 0,
  items_created INT DEFAULT 0,
  items_updated INT DEFAULT 0,
  items_skipped INT DEFAULT 0,
  items_failed INT DEFAULT 0,

  -- Details
  error_message TEXT,
  sync_cursor_start TEXT,
  sync_cursor_end TEXT,
  metadata JSONB DEFAULT '{}'
);

-- =============================================================================
-- 4. Indexes
-- =============================================================================

-- External connections indexes
CREATE INDEX IF NOT EXISTS idx_ext_conn_user_type
  ON external_connections(user_id, connector_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ext_conn_status
  ON external_connections(status, last_sync_at);

CREATE INDEX IF NOT EXISTS idx_ext_conn_org
  ON external_connections(organization_id)
  WHERE organization_id IS NOT NULL;

-- External sync items indexes
CREATE INDEX IF NOT EXISTS idx_ext_items_connection
  ON external_sync_items(connection_id, sync_status);

CREATE INDEX IF NOT EXISTS idx_ext_items_memory
  ON external_sync_items(memory_id)
  WHERE memory_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ext_items_hash
  ON external_sync_items(connection_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_ext_items_external
  ON external_sync_items(connection_id, external_id);

-- Sync history indexes
CREATE INDEX IF NOT EXISTS idx_ext_history_conn
  ON external_sync_history(connection_id, started_at DESC);

-- =============================================================================
-- 5. Row Level Security
-- =============================================================================

ALTER TABLE external_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_sync_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_sync_history ENABLE ROW LEVEL SECURITY;

-- External connections policies
CREATE POLICY "Users can view their own connections"
  ON external_connections FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can manage their own connections"
  ON external_connections FOR ALL
  USING (user_id = auth.uid()::text);

-- Sync items policies (through connection ownership)
CREATE POLICY "Users can view their sync items"
  ON external_sync_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM external_connections c
      WHERE c.id = connection_id AND c.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage their sync items"
  ON external_sync_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM external_connections c
      WHERE c.id = connection_id AND c.user_id = auth.uid()::text
    )
  );

-- Sync history policies
CREATE POLICY "Users can view their sync history"
  ON external_sync_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM external_connections c
      WHERE c.id = connection_id AND c.user_id = auth.uid()::text
    )
  );

-- Service role bypass
CREATE POLICY "Service role has full access to external_connections"
  ON external_connections FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

CREATE POLICY "Service role has full access to external_sync_items"
  ON external_sync_items FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

CREATE POLICY "Service role has full access to external_sync_history"
  ON external_sync_history FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- =============================================================================
-- 6. Triggers
-- =============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_external_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS external_connections_updated_at ON external_connections;
CREATE TRIGGER external_connections_updated_at
  BEFORE UPDATE ON external_connections
  FOR EACH ROW EXECUTE FUNCTION update_external_updated_at();

DROP TRIGGER IF EXISTS external_sync_items_updated_at ON external_sync_items;
CREATE TRIGGER external_sync_items_updated_at
  BEFORE UPDATE ON external_sync_items
  FOR EACH ROW EXECUTE FUNCTION update_external_updated_at();

-- =============================================================================
-- 7. Helper Functions
-- =============================================================================

-- Get user's active connections
CREATE OR REPLACE FUNCTION get_user_connections(
  p_user_id TEXT,
  p_connector_type VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  connector_type VARCHAR,
  connection_name TEXT,
  account_email TEXT,
  status VARCHAR,
  last_sync_at TIMESTAMPTZ,
  items_synced BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.connector_type,
    c.connection_name,
    c.account_email,
    c.status,
    c.last_sync_at,
    (SELECT COUNT(*) FROM external_sync_items s WHERE s.connection_id = c.id AND s.sync_status = 'synced')
  FROM external_connections c
  WHERE c.user_id = p_user_id
    AND (p_connector_type IS NULL OR c.connector_type = p_connector_type)
  ORDER BY c.created_at DESC;
END;
$$;

-- Update connection sync status
CREATE OR REPLACE FUNCTION update_connection_sync_status(
  p_connection_id UUID,
  p_status VARCHAR,
  p_error TEXT DEFAULT NULL,
  p_cursor TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE external_connections
  SET
    last_sync_at = NOW(),
    last_sync_status = p_status,
    last_sync_error = p_error,
    sync_cursor = COALESCE(p_cursor, sync_cursor),
    updated_at = NOW()
  WHERE id = p_connection_id;
END;
$$;

-- Get pending sync items
CREATE OR REPLACE FUNCTION get_pending_sync_items(
  p_connection_id UUID,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  external_id TEXT,
  title TEXT,
  source_url TEXT,
  content_hash TEXT,
  memory_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.external_id,
    s.title,
    s.source_url,
    s.content_hash,
    s.memory_id
  FROM external_sync_items s
  WHERE s.connection_id = p_connection_id
    AND s.sync_status IN ('pending', 'error')
  ORDER BY s.created_at ASC
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- 8. OAuth States Table (CSRF protection)
-- =============================================================================

CREATE TABLE IF NOT EXISTS external_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  connector_type VARCHAR(30) NOT NULL,
  redirect_uri TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for state lookup
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON external_oauth_states(state);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON external_oauth_states(expires_at);

-- Auto-cleanup expired states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM external_oauth_states WHERE expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleanup_oauth_states ON external_oauth_states;
CREATE TRIGGER cleanup_oauth_states
  AFTER INSERT ON external_oauth_states
  EXECUTE FUNCTION cleanup_expired_oauth_states();

-- =============================================================================
-- 9. Add missing columns to external_connections
-- =============================================================================

-- Add columns that the API routes expect
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'external_connections' AND column_name = 'account_name') THEN
    ALTER TABLE external_connections ADD COLUMN account_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'external_connections' AND column_name = 'account_metadata') THEN
    ALTER TABLE external_connections ADD COLUMN account_metadata JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'external_connections' AND column_name = 'sync_status') THEN
    ALTER TABLE external_connections ADD COLUMN sync_status VARCHAR(20) DEFAULT 'idle';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'external_connections' AND column_name = 'sync_started_at') THEN
    ALTER TABLE external_connections ADD COLUMN sync_started_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'external_connections' AND column_name = 'last_sync_completed_at') THEN
    ALTER TABLE external_connections ADD COLUMN last_sync_completed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'external_connections' AND column_name = 'last_sync_result') THEN
    ALTER TABLE external_connections ADD COLUMN last_sync_result JSONB;
  END IF;
END $$;

-- Add columns to sync history that API expects
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'external_sync_history' AND column_name = 'items_synced') THEN
    ALTER TABLE external_sync_history ADD COLUMN items_synced INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'external_sync_history' AND column_name = 'error_details') THEN
    ALTER TABLE external_sync_history ADD COLUMN error_details JSONB;
  END IF;
END $$;

-- Update status check constraint for sync_history to include 'partial' and 'success'
ALTER TABLE external_sync_history DROP CONSTRAINT IF EXISTS external_sync_history_status_check;
ALTER TABLE external_sync_history ADD CONSTRAINT external_sync_history_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'success', 'partial'));

-- =============================================================================
-- 10. Comments
-- =============================================================================

COMMENT ON TABLE external_connections IS 'OAuth connections to external services (Google Drive, Notion, GitHub, etc.)';
COMMENT ON TABLE external_sync_items IS 'Individual items synced from external services';
COMMENT ON TABLE external_sync_history IS 'Audit log of sync operations';
COMMENT ON TABLE external_oauth_states IS 'Temporary OAuth state tokens for CSRF protection';

COMMENT ON COLUMN external_connections.sync_cursor IS 'Cursor for incremental sync (page token, change token, etc.)';
COMMENT ON COLUMN external_sync_items.content_hash IS 'SHA256 hash of content for change detection';
COMMENT ON COLUMN external_sync_items.memory_id IS 'Reference to created Spring Memory note';
