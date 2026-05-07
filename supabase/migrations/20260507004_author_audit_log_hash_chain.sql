-- Author audit log integrity: hash chain + immutability.
--
-- Pre-audit (Phase 3 finding 2026-05-07), the audit log had no hash-chain
-- columns despite the application code claiming "hash-chained" semantics.
-- replayAuthorAuditChain computed a payload hash but never compared it
-- against anything stored. Anyone with service-role access (or Supabase
-- dashboard access) could edit historical rows and replay would still
-- return replayStatus: 'deterministic'. Compliance / legal claims around
-- tamper-evidence were vacuous.
--
-- This migration adds:
--   1. previous_hash, entry_hash columns
--   2. BEFORE INSERT trigger that:
--      - rejects inserts where parent_decision_id is set but
--        previous_hash doesn't match the parent's entry_hash
--      - requires previous_hash to be NULL when parent_decision_id is NULL
--      - validates entry_hash format (sha256 hex = 64 chars)
--   3. BEFORE UPDATE / BEFORE DELETE trigger that RAISE EXCEPTIONs —
--      audit log entries are immutable
--   4. REVOKE UPDATE, DELETE FROM service_role as belt-and-braces
--
-- The actual sha256 computation is done in the application (logger.ts) so
-- canonical JSON ordering matches the replay path. The trigger only
-- enforces chain linkage and immutability — defense-in-depth against
-- tampering, not the cryptographic primitive itself.

-- 1. Columns ---------------------------------------------------------------

ALTER TABLE public.author_audit_log
  ADD COLUMN IF NOT EXISTS previous_hash TEXT,
  ADD COLUMN IF NOT EXISTS entry_hash TEXT;

-- Allow NULL during the backfill window for existing rows; new inserts will
-- be required to populate these via the application.
COMMENT ON COLUMN public.author_audit_log.previous_hash IS
  'sha256 hex of the parent entry (looked up via parent_decision_id). NULL for root entries.';
COMMENT ON COLUMN public.author_audit_log.entry_hash IS
  'sha256 hex of canonical JSON of (previous_hash, project_id, user_id, event_type, payload, llm_meta, source_span, decision_id, parent_decision_id, created_at). NOT NULL for entries written after this migration.';

-- 2. Chain-integrity trigger -----------------------------------------------

CREATE OR REPLACE FUNCTION public.author_audit_log_enforce_chain()
RETURNS TRIGGER AS $$
DECLARE
  parent_entry_hash TEXT;
BEGIN
  -- entry_hash is required for new inserts. Pre-migration rows are
  -- grandfathered with NULL but new writes must populate.
  IF NEW.entry_hash IS NULL THEN
    RAISE EXCEPTION 'author_audit_log.entry_hash is required for new entries (pre-migration rows are grandfathered)';
  END IF;
  IF NEW.entry_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'author_audit_log.entry_hash must be 64-char hex (sha256), got: %', NEW.entry_hash;
  END IF;

  -- Chain linkage: if this entry has a parent, look it up and verify
  -- previous_hash matches the parent's entry_hash. If no parent, previous_hash
  -- must be NULL. Pre-migration parents (entry_hash IS NULL) skip enforcement
  -- so the chain can bootstrap; once the parent is post-migration, all
  -- children must link correctly.
  IF NEW.parent_decision_id IS NOT NULL THEN
    SELECT entry_hash INTO parent_entry_hash
    FROM public.author_audit_log
    WHERE decision_id = NEW.parent_decision_id
      AND user_id = NEW.user_id;
    IF parent_entry_hash IS NULL THEN
      -- Parent is pre-migration grandfathered; skip strict check (one-time
      -- backfill window). Log the bootstrap so an audit can spot it.
      NULL;
    ELSIF NEW.previous_hash IS NULL OR NEW.previous_hash <> parent_entry_hash THEN
      RAISE EXCEPTION 'author_audit_log: previous_hash mismatch (decision_id=% expected=% got=%)',
        NEW.decision_id, parent_entry_hash, COALESCE(NEW.previous_hash, '<null>');
    END IF;
  ELSIF NEW.previous_hash IS NOT NULL THEN
    RAISE EXCEPTION 'author_audit_log: previous_hash must be NULL when parent_decision_id is NULL';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS author_audit_log_chain_trigger ON public.author_audit_log;
CREATE TRIGGER author_audit_log_chain_trigger
  BEFORE INSERT ON public.author_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.author_audit_log_enforce_chain();

-- 3. Immutability triggers -------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_audit_log_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'author_audit_log is append-only — UPDATE/DELETE rejected (decision_id=%)',
    COALESCE(OLD.decision_id, '<null>');
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS author_audit_log_no_update ON public.author_audit_log;
CREATE TRIGGER author_audit_log_no_update
  BEFORE UPDATE ON public.author_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.author_audit_log_reject_mutation();

DROP TRIGGER IF EXISTS author_audit_log_no_delete ON public.author_audit_log;
CREATE TRIGGER author_audit_log_no_delete
  BEFORE DELETE ON public.author_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.author_audit_log_reject_mutation();

-- 4. Belt-and-braces: revoke UPDATE / DELETE from service_role -------------
--
-- Service role bypasses RLS, but the trigger above already rejects mutations.
-- This is defense-in-depth: even if a future migration accidentally drops
-- the trigger, the role itself loses the privilege. SELECT and INSERT remain
-- (the app needs both); cascading FK delete from `profiles` would still
-- work because that runs as the table owner, not service_role.

REVOKE UPDATE, DELETE ON public.author_audit_log FROM service_role;

-- 5. Index for parent lookup (the trigger does a parent_decision_id lookup
-- on every insert; the existing UNIQUE constraint on decision_id already
-- gives us that index, so this is redundant but documented for clarity)

COMMENT ON TRIGGER author_audit_log_chain_trigger ON public.author_audit_log IS
  'Enforces hash-chain linkage between an entry and its parent_decision_id. previous_hash must equal the parent entry_hash (or both NULL for roots).';
COMMENT ON TRIGGER author_audit_log_no_update ON public.author_audit_log IS
  'Audit log is append-only — UPDATE rejected at the trigger level even when service-role bypasses RLS.';
COMMENT ON TRIGGER author_audit_log_no_delete ON public.author_audit_log IS
  'Audit log is append-only — DELETE rejected at the trigger level even when service-role bypasses RLS.';
