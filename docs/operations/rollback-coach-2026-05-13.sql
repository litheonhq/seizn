-- Rollback for the Author Coach feature (PRs #384, #385).
--
-- ⚠️ NOT a Supabase auto-migration. Living here under docs/operations/ so the
-- Supabase migration runner does NOT pick it up. To execute, copy into
-- supabase/migrations/ with a fresh timestamp and run via the standard
-- runner, or apply manually with psql against the target database.
--
-- Verify on staging before touching production.
--
-- Effects:
--   * Drops sacred_flaw / internal_need / external_want / philosophical_purpose
--     / arc_direction from author_characters. Persisted data in those columns
--     is destroyed.
--   * Deletes every existing `coach.analysis` row in author_audit_log so the
--     pre-Coach CHECK constraint can be rebuilt.
--   * Reinstates the pre-Coach event_type CHECK on author_audit_log.
--
-- Required follow-up after applying this rollback:
--   * Remove the Coach tab from AUTHOR_WORKSPACE_TABS + nav-config (or set
--     AUTHOR_COACH_ENABLED=0 in Vercel to disable without code changes).
--   * Drop /api/projects/[projectId]/coach/analyze route in a code PR.

BEGIN;

-- 1. Remove every coach.analysis audit row so the rebuilt CHECK can apply.
DELETE FROM author_audit_log WHERE event_type = 'coach.analysis';

-- 2. Drop the broadened CHECK and reinstate the pre-Coach version.
ALTER TABLE author_audit_log DROP CONSTRAINT IF EXISTS author_audit_log_event_type_check;
ALTER TABLE author_audit_log
  ADD CONSTRAINT author_audit_log_event_type_check
  CHECK (event_type IN (
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
  ));

-- 3. Drop the Storr arc columns + their named constraint.
ALTER TABLE author_characters
  DROP CONSTRAINT IF EXISTS author_characters_arc_direction_check;
ALTER TABLE author_characters
  DROP COLUMN IF EXISTS sacred_flaw,
  DROP COLUMN IF EXISTS internal_need,
  DROP COLUMN IF EXISTS external_want,
  DROP COLUMN IF EXISTS philosophical_purpose,
  DROP COLUMN IF EXISTS arc_direction;

COMMIT;
