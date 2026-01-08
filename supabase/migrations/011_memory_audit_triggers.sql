-- Memory Access Audit Triggers
-- Tracks all memory operations for security and compliance

-- Memory audit trigger function
CREATE OR REPLACE FUNCTION audit_memory_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_event(
      NEW.user_id::text,
      NULL,
      NULL,
      'memory.create',
      'memory',
      NEW.id,
      jsonb_build_object(
        'content_length', length(NEW.content),
        'memory_type', NEW.memory_type,
        'scope', NEW.scope,
        'source', NEW.source
      ),
      NULL,
      NULL
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log soft deletes
    IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
      PERFORM log_audit_event(
        NEW.user_id::text,
        NULL,
        NULL,
        'memory.delete',
        'memory',
        NEW.id,
        jsonb_build_object('content_length', length(OLD.content)),
        jsonb_build_object('is_deleted', false),
        jsonb_build_object('is_deleted', true)
      );
    -- Log content/metadata updates
    ELSIF OLD.content IS DISTINCT FROM NEW.content OR
          OLD.memory_type IS DISTINCT FROM NEW.memory_type OR
          OLD.tags IS DISTINCT FROM NEW.tags THEN
      PERFORM log_audit_event(
        NEW.user_id::text,
        NULL,
        NULL,
        'memory.update',
        'memory',
        NEW.id,
        jsonb_build_object('fields_changed',
          ARRAY_REMOVE(ARRAY[
            CASE WHEN OLD.content IS DISTINCT FROM NEW.content THEN 'content' END,
            CASE WHEN OLD.memory_type IS DISTINCT FROM NEW.memory_type THEN 'memory_type' END,
            CASE WHEN OLD.tags IS DISTINCT FROM NEW.tags THEN 'tags' END
          ], NULL)
        ),
        NULL,
        NULL
      );
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS memory_audit_trigger ON memories;
CREATE TRIGGER memory_audit_trigger
  AFTER INSERT OR UPDATE ON memories
  FOR EACH ROW
  EXECUTE FUNCTION audit_memory_changes();

-- Add service_role access tracking
-- This logs when service_role key is used (bypasses RLS)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS is_service_role BOOLEAN DEFAULT false;

-- Index for service role access queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_service_role ON audit_logs(is_service_role, created_at DESC)
  WHERE is_service_role = true;

-- Add retention policy comment
COMMENT ON TABLE audit_logs IS 'Audit trail for compliance. Recommend 90-day retention for standard, 1 year for compliance.';

-- Create view for suspicious activity detection
CREATE OR REPLACE VIEW suspicious_activity AS
SELECT
  user_id,
  action,
  COUNT(*) as event_count,
  MIN(created_at) as first_event,
  MAX(created_at) as last_event,
  COUNT(DISTINCT ip_address) as unique_ips
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id, action
HAVING COUNT(*) > 100  -- More than 100 same actions in 24h
   OR COUNT(DISTINCT ip_address) > 10;  -- More than 10 different IPs

COMMENT ON VIEW suspicious_activity IS 'Detects potential abuse: high-volume actions or multiple IPs';
