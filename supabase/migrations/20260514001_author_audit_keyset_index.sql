-- Add composite keyset-pagination index for author_audit_log.
--
-- The cursor-based pagination in src/lib/author/audit/logger.ts queries with
-- the tiebreaker pattern:
--   created_at < $cursor_ts
--   OR (created_at = $cursor_ts AND id < $cursor_id)
--
-- The existing index idx_author_audit_project_event from migration
-- 20260502006_author_audit_log.sql is (user_id, project_id, event_type,
-- created_at DESC) — it doesn't include id, so the tiebreaker branch falls
-- back to a heap scan after the cursor's timestamp range is exhausted.
--
-- This new composite index lets the keyset query stay on an index scan all
-- the way through, including when consecutive rows share created_at.

CREATE INDEX IF NOT EXISTS idx_author_audit_keyset
  ON author_audit_log (user_id, project_id, created_at DESC, id DESC);

COMMENT ON INDEX idx_author_audit_keyset IS
  'Supports keyset pagination over (created_at, id) tiebreaker. See src/lib/author/audit/logger.ts list query.';
