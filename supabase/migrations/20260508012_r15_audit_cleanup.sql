-- R15 — R14 audit follow-up.
--
-- Locked 2026-05-08. Three SQL-side items:
--   1. (HIGH 1) Add partial index for `metadata->>'moderation_pending' =
--      'true'` so a future async sweep can pick up Obsidian-imported
--      rows in bounded batches. The sweep itself is NOT shipped today —
--      this is groundwork only. Without the index, a sweep query would
--      do full-table scans on the JSONB key and break under load.
--
--   2. (HIGH 2) The bounded RPC wrappers (`hybrid_search_memories_bounded`,
--      `keyword_search_memories_bounded`, `search_memories_bounded`) were
--      missed by R12's REVOKE pass — only the un-bounded versions had
--      `REVOKE EXECUTE ... FROM anon, authenticated` applied. Apply the
--      same posture to the bounded wrappers now. They are SECURITY DEFINER
--      with caller-supplied user_id, same risk profile.
--
--   3. (HIGH 2 secondary) Align bounded wrappers' search_path with R6
--      (`public`, `extensions`). They delegate to the inner functions,
--      so vector op resolution flows through correctly today, but
--      keeping search_path consistent prevents surprise breakage if a
--      future patch ever adds direct pgvector calls inside the wrapper.
--
-- Rollback: each REVOKE has matching GRANT in 20260302001 / 20260306005.
-- DROP INDEX idx_memories_moderation_pending IS NULL safe.

BEGIN;

-- 1. moderation_pending sweep groundwork ---------------------------------
CREATE INDEX IF NOT EXISTS idx_memories_moderation_pending
  ON public.memories ((metadata->>'moderation_pending'))
  WHERE NOT COALESCE(is_deleted, FALSE)
    AND metadata->>'moderation_pending' = 'true';

COMMENT ON INDEX public.idx_memories_moderation_pending IS
  'R15 (2026-05-08): partial index for async LLM moderation sweep on Obsidian-imported rows. The sweep job itself is not yet implemented; this index lets the future implementation scan in bounded batches without a full-table seq scan.';

-- 2. REVOKE on bounded wrappers ------------------------------------------
-- Mirrors R12 posture — the bounded versions were missed at R12 time.
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
       AND p.proname IN (
         'hybrid_search_memories_bounded',
         'keyword_search_memories_bounded',
         'search_memories_bounded'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', proc.sig);
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', proc.sig
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role', proc.sig
    );
  END LOOP;
END $$;

-- 3. search_path alignment for bounded wrappers --------------------------
-- ALTER FUNCTION SET search_path is allowed by Supabase for our role
-- (only the hnsw GUC is locked down). search_path = ('public',
-- 'extensions') matches R6 / R13 posture so future direct pgvector
-- calls inside the wrapper body resolve.
ALTER FUNCTION public.keyword_search_memories_bounded(
  text, text, integer, text, integer
) SET search_path TO 'public', 'extensions';

ALTER FUNCTION public.search_memories_bounded(
  vector, text, integer, double precision, text, integer
) SET search_path TO 'public', 'extensions';

ALTER FUNCTION public.hybrid_search_memories_bounded(
  text, vector, text, integer, double precision, text, double precision, double precision, integer
) SET search_path TO 'public', 'extensions';

-- 4. Atomic Obsidian path upsert ----------------------------------------
-- Pre-fix: route did UPDATE-then-INSERT in two HTTP calls. Race: caller B's
-- UPDATE filter (is_deleted=false) would match caller A's just-inserted
-- row when both reuse the same path with replace_existing=true, so B
-- could silently flag A's fresh row as deleted before INSERTing its own.
-- This RPC wraps the find-existing → update-or-insert flow in one
-- Postgres transaction with FOR UPDATE locking; partial unique index
-- serves as a backstop.
CREATE OR REPLACE FUNCTION public.obsidian_upsert_note(
  p_user_id text,
  p_namespace text,
  p_path text,
  p_content text,
  p_content_hash text,
  p_tags text[],
  p_modified_at timestamptz,
  p_metadata jsonb,
  p_replace_existing boolean DEFAULT false
)
RETURNS text  -- 'imported' | 'updated' | 'skipped'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  -- Find active row at this path; lock it for the duration of the tx.
  SELECT id INTO v_existing_id
    FROM public.memories
   WHERE user_id = p_user_id
     AND namespace = p_namespace
     AND NOT COALESCE(is_deleted, FALSE)
     AND metadata->>'obsidian_path' = p_path
   FOR UPDATE;

  IF FOUND THEN
    -- Existing active row at path. Update only when caller asked for
    -- replace_existing=true; otherwise return 'skipped' so caller stats
    -- match the prior content_hash dedup behavior.
    IF NOT p_replace_existing THEN
      RETURN 'skipped';
    END IF;
    UPDATE public.memories
       SET content = p_content,
           content_hash = p_content_hash,
           tags = p_tags,
           valid_at = COALESCE(p_modified_at, valid_at),
           metadata = p_metadata,
           updated_at = now()
     WHERE id = v_existing_id;
    RETURN 'updated';
  END IF;

  -- No active row at path; insert. Partial unique index catches a tight
  -- concurrent insert race and surfaces as unique_violation → 'skipped'.
  INSERT INTO public.memories (
    user_id, namespace, content, content_hash, source, memory_type, tags,
    valid_at, metadata
  ) VALUES (
    p_user_id, p_namespace, p_content, p_content_hash, 'obsidian', 'fact',
    p_tags, COALESCE(p_modified_at, now()), p_metadata
  );

  RETURN 'imported';

EXCEPTION
  WHEN unique_violation THEN
    RETURN 'skipped';
END;
$$;

-- The function is SECURITY DEFINER with caller-supplied user_id; only
-- service_role contexts (the obsidian import route) should invoke it.
REVOKE EXECUTE ON FUNCTION public.obsidian_upsert_note(
  text, text, text, text, text, text[], timestamptz, jsonb, boolean
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.obsidian_upsert_note(
  text, text, text, text, text, text[], timestamptz, jsonb, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obsidian_upsert_note(
  text, text, text, text, text, text[], timestamptz, jsonb, boolean
) TO service_role;

COMMENT ON FUNCTION public.obsidian_upsert_note(
  text, text, text, text, text, text[], timestamptz, jsonb, boolean
) IS
  'R15 (2026-05-08): atomic upsert for Obsidian-imported notes. Replaces the prior 2-step soft-delete + insert flow that raced concurrent callers re-importing the same path. FOR UPDATE locking + partial unique backstop.';

NOTIFY pgrst, 'reload schema';

COMMIT;
