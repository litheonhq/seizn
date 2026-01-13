-- Seizn Combo F - Index Versioning & Snapshots
-- Migration: 046_combo_f_versioning.sql
--
-- Tables:
-- - index_versions: Version control for vector indexes
-- - version_snapshots: Point-in-time snapshots of index state

-- ===========================================
-- 1) Index Versions
-- ===========================================
CREATE TABLE IF NOT EXISTS index_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Which collection this version belongs to
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,

  -- Version metadata
  version_number INT NOT NULL,
  version_tag TEXT, -- e.g., 'v1.0.0', 'stable', 'canary'

  -- Status: building, active, deprecated, archived
  status TEXT NOT NULL DEFAULT 'building',

  -- Config snapshot at this version
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimensions INT NOT NULL,
  chunking_config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Stats
  document_count INT NOT NULL DEFAULT 0,
  chunk_count INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,

  -- Build info
  build_started_at TIMESTAMPTZ,
  build_completed_at TIMESTAMPTZ,
  build_duration_ms INT,
  build_error TEXT,

  -- Activation tracking
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,

  -- Metadata
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(collection_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_index_versions_user
  ON index_versions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_index_versions_collection
  ON index_versions(collection_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_index_versions_active
  ON index_versions(collection_id, status)
  WHERE status = 'active';

-- ===========================================
-- 2) Version Snapshots
-- ===========================================
CREATE TABLE IF NOT EXISTS version_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Related version
  version_id UUID NOT NULL REFERENCES index_versions(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,

  -- Snapshot type: full, incremental, diff
  snapshot_type TEXT NOT NULL DEFAULT 'full',

  -- Parent snapshot for incremental
  parent_snapshot_id UUID REFERENCES version_snapshots(id) ON DELETE SET NULL,

  -- Snapshot metadata
  name TEXT,
  description TEXT,

  -- Content summary
  document_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  chunk_count INT NOT NULL DEFAULT 0,

  -- Storage info
  storage_location TEXT, -- S3 path, local path, etc.
  storage_size_bytes BIGINT,
  compression TEXT, -- none, gzip, zstd

  -- Checksums for integrity
  content_hash TEXT,
  manifest JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Restore tracking
  last_restored_at TIMESTAMPTZ,
  restore_count INT NOT NULL DEFAULT 0,

  -- Expiration
  expires_at TIMESTAMPTZ,
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_version_snapshots_user
  ON version_snapshots(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_version_snapshots_version
  ON version_snapshots(version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_version_snapshots_collection
  ON version_snapshots(collection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_version_snapshots_expiring
  ON version_snapshots(expires_at)
  WHERE expires_at IS NOT NULL AND is_protected = FALSE;

-- ===========================================
-- 3) RLS Policies
-- ===========================================
ALTER TABLE index_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE version_snapshots ENABLE ROW LEVEL SECURITY;

-- Index versions
CREATE POLICY "Users can view own index_versions"
  ON index_versions FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own index_versions"
  ON index_versions FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own index_versions"
  ON index_versions FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own index_versions"
  ON index_versions FOR DELETE
  USING (auth.uid()::TEXT = user_id);

-- Version snapshots
CREATE POLICY "Users can view own version_snapshots"
  ON version_snapshots FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own version_snapshots"
  ON version_snapshots FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own version_snapshots"
  ON version_snapshots FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own version_snapshots"
  ON version_snapshots FOR DELETE
  USING (auth.uid()::TEXT = user_id AND is_protected = FALSE);

-- ===========================================
-- 4) Helper Functions
-- ===========================================

-- Get active version for a collection
CREATE OR REPLACE FUNCTION get_active_index_version(p_collection_id UUID)
RETURNS UUID AS $$
  SELECT id
  FROM index_versions
  WHERE collection_id = p_collection_id
    AND status = 'active'
  ORDER BY version_number DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Get next version number for a collection
CREATE OR REPLACE FUNCTION get_next_version_number(p_collection_id UUID)
RETURNS INT AS $$
  SELECT COALESCE(MAX(version_number), 0) + 1
  FROM index_versions
  WHERE collection_id = p_collection_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Activate a version (deactivates others)
CREATE OR REPLACE FUNCTION activate_index_version(
  p_version_id UUID,
  p_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_version RECORD;
BEGIN
  -- Get the version
  SELECT * INTO v_version
  FROM index_versions
  WHERE id = p_version_id AND user_id = p_user_id;

  IF v_version IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_version.status != 'building' AND v_version.status != 'deprecated' THEN
    -- Only building or deprecated versions can be activated
    IF v_version.status = 'active' THEN
      RETURN TRUE; -- Already active
    END IF;
    RETURN FALSE;
  END IF;

  -- Deactivate other versions in the same collection
  UPDATE index_versions
  SET
    status = 'deprecated',
    deactivated_at = NOW(),
    updated_at = NOW()
  WHERE collection_id = v_version.collection_id
    AND status = 'active'
    AND id != p_version_id;

  -- Activate this version
  UPDATE index_versions
  SET
    status = 'active',
    activated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_version_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a snapshot from a version
CREATE OR REPLACE FUNCTION create_version_snapshot(
  p_version_id UUID,
  p_user_id TEXT,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_snapshot_type TEXT DEFAULT 'full'
)
RETURNS UUID AS $$
DECLARE
  v_version RECORD;
  v_snapshot_id UUID;
BEGIN
  SELECT * INTO v_version
  FROM index_versions
  WHERE id = p_version_id AND user_id = p_user_id;

  IF v_version IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO version_snapshots (
    user_id, version_id, collection_id, snapshot_type,
    name, description,
    chunk_count
  ) VALUES (
    p_user_id, p_version_id, v_version.collection_id, p_snapshot_type,
    COALESCE(p_name, 'Snapshot v' || v_version.version_number),
    p_description,
    v_version.chunk_count
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired snapshots
CREATE OR REPLACE FUNCTION cleanup_expired_snapshots(p_batch_size INT DEFAULT 100)
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  WITH deleted AS (
    DELETE FROM version_snapshots
    WHERE expires_at < NOW()
      AND is_protected = FALSE
      AND id IN (
        SELECT id FROM version_snapshots
        WHERE expires_at < NOW()
          AND is_protected = FALSE
        LIMIT p_batch_size
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 5) Triggers
-- ===========================================

CREATE OR REPLACE FUNCTION update_index_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_index_versions_updated ON index_versions;
CREATE TRIGGER trigger_index_versions_updated
  BEFORE UPDATE ON index_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_index_versions_updated_at();

-- ===========================================
-- 6) Views
-- ===========================================

CREATE OR REPLACE VIEW index_version_stats AS
SELECT
  iv.user_id,
  iv.collection_id,
  sc.name AS collection_name,
  COUNT(*) AS total_versions,
  COUNT(*) FILTER (WHERE iv.status = 'active') AS active_versions,
  COUNT(*) FILTER (WHERE iv.status = 'building') AS building_versions,
  MAX(iv.version_number) AS latest_version,
  SUM(iv.chunk_count) AS total_chunks,
  MAX(iv.created_at) AS last_version_at
FROM index_versions iv
JOIN summer_collections sc ON sc.id = iv.collection_id
GROUP BY iv.user_id, iv.collection_id, sc.name;

GRANT SELECT ON index_version_stats TO authenticated;

-- ===========================================
-- 7) Comments
-- ===========================================
COMMENT ON TABLE index_versions IS 'Version control for vector indexes, tracks config and stats per version';
COMMENT ON TABLE version_snapshots IS 'Point-in-time snapshots of index state for backup and restore';
COMMENT ON FUNCTION get_active_index_version IS 'Get the currently active version for a collection';
COMMENT ON FUNCTION get_next_version_number IS 'Get the next version number for a collection';
COMMENT ON FUNCTION activate_index_version IS 'Activate a version, deactivating others';
COMMENT ON FUNCTION create_version_snapshot IS 'Create a new snapshot from a version';
COMMENT ON FUNCTION cleanup_expired_snapshots IS 'Remove expired snapshots';
COMMENT ON VIEW index_version_stats IS 'Aggregated statistics for index versions per collection';
