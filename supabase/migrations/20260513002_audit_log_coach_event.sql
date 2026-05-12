-- Seizn Author Memory v3 — register the 'coach.analysis' event type so the
-- Author Coach feature can persist analysis results into author_audit_log.
-- This migration replaces the existing CHECK constraint with one that adds the
-- new value. It is idempotent: if 'coach.analysis' is already accepted, the
-- constraint is left alone.

DO $$
DECLARE
  has_constraint BOOLEAN;
  needs_update BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'author_audit_log_event_type_check'
      AND conrelid = 'public.author_audit_log'::regclass
  ) INTO has_constraint;

  -- Probe whether the new value is already allowed by attempting a no-op cast.
  needs_update := NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'author_audit_log_event_type_check'
      AND conrelid = 'public.author_audit_log'::regclass
      AND pg_get_constraintdef(oid) LIKE '%coach.analysis%'
  );

  IF has_constraint AND needs_update THEN
    ALTER TABLE author_audit_log DROP CONSTRAINT author_audit_log_event_type_check;
  END IF;

  IF needs_update THEN
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
        'byok.updated',
        'coach.analysis'
      ));
  END IF;
END $$;
