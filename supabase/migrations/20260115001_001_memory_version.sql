-- Migration: Memory Version Tracking for Cache Invalidation
-- This enables automatic cache invalidation when memories are modified.
-- The version is incremented on INSERT, UPDATE, DELETE operations.

-- Create memory_versions table to track per-user/namespace versions
CREATE TABLE IF NOT EXISTS memory_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT 'default',
    version INTEGER NOT NULL DEFAULT 1,
    last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, namespace)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_memory_versions_user_namespace
    ON memory_versions(user_id, namespace);

-- Function to increment version on memory changes
CREATE OR REPLACE FUNCTION increment_memory_version()
RETURNS TRIGGER AS $$
DECLARE
    target_user_id TEXT;
    target_namespace TEXT;
BEGIN
    -- Determine user_id and namespace based on operation
    IF TG_OP = 'DELETE' THEN
        target_user_id := OLD.user_id;
        target_namespace := COALESCE(OLD.namespace, 'default');
    ELSE
        target_user_id := NEW.user_id;
        target_namespace := COALESCE(NEW.namespace, 'default');
    END IF;

    -- Upsert the version record
    INSERT INTO memory_versions (user_id, namespace, version, last_modified_at)
    VALUES (target_user_id, target_namespace, 1, NOW())
    ON CONFLICT (user_id, namespace)
    DO UPDATE SET
        version = memory_versions.version + 1,
        last_modified_at = NOW();

    -- Return appropriate record for the trigger
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for INSERT operations
DROP TRIGGER IF EXISTS trg_memory_insert_version ON memories;
CREATE TRIGGER trg_memory_insert_version
    AFTER INSERT ON memories
    FOR EACH ROW
    EXECUTE FUNCTION increment_memory_version();

-- Trigger for UPDATE operations
DROP TRIGGER IF EXISTS trg_memory_update_version ON memories;
CREATE TRIGGER trg_memory_update_version
    AFTER UPDATE ON memories
    FOR EACH ROW
    WHEN (OLD.content IS DISTINCT FROM NEW.content
          OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
          OR OLD.importance IS DISTINCT FROM NEW.importance)
    EXECUTE FUNCTION increment_memory_version();

-- Trigger for DELETE operations
DROP TRIGGER IF EXISTS trg_memory_delete_version ON memories;
CREATE TRIGGER trg_memory_delete_version
    AFTER DELETE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION increment_memory_version();

-- Function to get current version for a user/namespace
CREATE OR REPLACE FUNCTION get_memory_version(
    p_user_id TEXT,
    p_namespace TEXT DEFAULT 'default'
)
RETURNS INTEGER AS $$
DECLARE
    current_version INTEGER;
BEGIN
    SELECT version INTO current_version
    FROM memory_versions
    WHERE user_id = p_user_id AND namespace = p_namespace;

    RETURN COALESCE(current_version, 0);
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on memory_versions
ALTER TABLE memory_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own versions
CREATE POLICY memory_versions_user_policy ON memory_versions
    FOR ALL
    USING (auth.uid()::text = user_id);

-- Policy: Service role can access all
CREATE POLICY memory_versions_service_policy ON memory_versions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE memory_versions IS 'Tracks memory modification versions for cache invalidation';
COMMENT ON FUNCTION increment_memory_version() IS 'Auto-increments version on memory table changes';
COMMENT ON FUNCTION get_memory_version(TEXT, TEXT) IS 'Gets current version for cache key generation';
