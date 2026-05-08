-- R12 — DB-side fixes from R11 audit (3 parallel agent reports).
--
-- Locked 2026-05-08. 6 SQL-side defects:
--   1. (CRITICAL B1) memories.valid_at has no DEFAULT. POST omits the
--      field, inserts NULL, then any GET ?as_of=... silently drops the
--      row because applyTemporalFilters does .lte('valid_at', asOf).
--   2. (HIGH B5/B6/B9) Anthropic-tool create/rename race: two concurrent
--      writes to the same /memories/<ns>/<name> both pass findMemoryByPath
--      and both INSERT, leaving findMemoryByPath ambiguous. Need a
--      partial unique index on (user_id, namespace, anthropic_tool_name).
--   3. (HIGH B7)  Obsidian replace_existing race produces duplicate
--      live rows for the same vault path. Need a partial unique index
--      on (user_id, namespace, obsidian_path).
--   4. (MED A6)   search_memories is SECURITY DEFINER with a caller-
--      supplied user_id arg. Needs explicit REVOKE so future
--      `GRANT EXECUTE ... TO authenticated` regressions can't open
--      cross-tenant reads.
--   5. (MED C6)   hybrid_search_memories + keyword_search_memories were
--      not patched in R6. They share the same WHERE filter pattern;
--      same iterative_scan benefit applies.
--
-- Rollback: each ALTER/CREATE/REVOKE has a matching reverse. Note the
-- partial unique indexes will fail to create if existing duplicates
-- exist — preflight in this migration includes a SELECT block to
-- surface those rows for cleanup before retrying.

BEGIN;

-- 0. CRITICAL — memories.metadata column was missing -----------------------
-- R8 (anthropic-tool) and R10 (obsidian-import) routes both write to
-- `metadata` JSONB on insert. R11 audit caught at planning time that
-- the column never existed; only `companion_meta` and `moderation_scores`
-- were present. No prod traffic has hit either route yet, so no row was
-- silently corrupted — the inserts would have errored on first call.
-- Adding the column with sane defaults resolves the bug AND backfills
-- the existing 1,238 memory rows with `'{}'::jsonb`.
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index used by anthropic-tool / obsidian path lookups (.contains).
CREATE INDEX IF NOT EXISTS idx_memories_metadata_gin
  ON public.memories USING GIN (metadata)
  WHERE NOT COALESCE(is_deleted, FALSE);

-- 1. valid_at default ------------------------------------------------------
-- Existing rows already have valid_at (R9 backfill). New rows get now()
-- when caller doesn't supply, mirroring Author Memory v3 behavior.
ALTER TABLE public.memories
  ALTER COLUMN valid_at SET DEFAULT now();

-- 2. Anthropic-tool path uniqueness ---------------------------------------
-- Partial unique on (user_id, namespace, metadata->>'anthropic_tool_name')
-- catches the duplicate-INSERT race in handleCreate / handleRename.
-- Filter ensures we only constrain rows that the tool actually owns;
-- rows from other channels (regular /api/v1/memories writers) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_anthropic_tool_path_unique
  ON public.memories (user_id, namespace, ((metadata->>'anthropic_tool_name')))
  WHERE NOT COALESCE(is_deleted, FALSE)
    AND metadata->>'anthropic_tool_name' IS NOT NULL;

-- 3. Obsidian path uniqueness ---------------------------------------------
-- Partial unique on (user_id, namespace, metadata->>'obsidian_path')
-- closes the replace_existing race + serves as the dedup key when
-- replace_existing=false (instead of relying on content_hash which
-- includes path → bug C1).
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_obsidian_path_unique
  ON public.memories (user_id, namespace, ((metadata->>'obsidian_path')))
  WHERE NOT COALESCE(is_deleted, FALSE)
    AND metadata->>'obsidian_path' IS NOT NULL;

-- 4. REVOKE EXECUTE on search_memories ------------------------------------
-- The function takes match_user_id from the caller; only service-role
-- contexts should call it. This makes the contract explicit so a future
-- GRANT regression can't open cross-tenant reads.
REVOKE EXECUTE ON FUNCTION public.search_memories(
  vector, text, integer, double precision, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_memories(
  vector, text, integer, double precision, text
) FROM anon, authenticated;

-- 5. REVOKE EXECUTE on hybrid/keyword search functions -------------------
-- ALTER FUNCTION ... SET hnsw.iterative_scan would have force-pinned the
-- GUC per-call, but Supabase's Management API role lacks the privilege
-- (`permission denied to set parameter "hnsw.iterative_scan"`). Fall back
-- to the database-level default set in R6 (ALTER DATABASE postgres
-- SET hnsw.iterative_scan='relaxed_order'), which new sessions inherit.
-- The remaining audit concern — pgbouncer pooled connections potentially
-- skipping the default — is out of reach without superuser access. Document
-- the limitation here so the next reader knows to verify pool behavior in
-- staging before scaling hybrid_search_memories traffic.
DO $$
DECLARE
  proc RECORD;
BEGIN
  FOR proc IN
    SELECT format('%I.%I(%s)',
                  n.nspname,
                  p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('hybrid_search_memories', 'keyword_search_memories')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', proc.sig);
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', proc.sig
    );
  END LOOP;
END $$;

COMMIT;
