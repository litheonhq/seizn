-- 2026-05-12 P0: rebuild memories.content_tsv as a STORED generated column.
--
-- The original schema (006_hybrid_search.sql) declared:
--   ALTER TABLE memories ADD COLUMN IF NOT EXISTS content_tsv tsvector
--   GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
--
-- Production diagnosis on 2026-05-12 showed every row in memories (1272 rows)
-- has content_tsv = NULL. Somewhere between the 006 migration and prod, the
-- GENERATED ALWAYS clause was lost — the column exists but no longer auto-
-- populates on INSERT/UPDATE. The result is that keyword_search_memories
-- (and its bounded variant) filter `WHERE m.content_tsv @@ plainto_tsquery(...)`
-- and match zero rows for every user, regardless of content.
--
-- Symptoms:
--   - MCP `search_nodes`/`open_nodes`/`delete_*` (which fall through to keyword
--     mode for name lookups) return empty for entities that demonstrably exist
--   - Route `/api/v1/memories?mode=hybrid` falls back to keyword on bridge
--     timeout, the fallback also returns empty, the executor reports "success"
--     and the user sees [] even when they have hundreds of memories
--   - Hybrid mode partially worked only because of vector search; pure keyword
--     paths were silently broken across the product
--
-- Fix:
--   - Drop the broken column (data is uniformly NULL → no information loss)
--   - Re-add as GENERATED ALWAYS STORED so Postgres recomputes content_tsv
--     for every existing row on creation and for every future insert/update
--   - Rebuild the GIN index that keyword_search_memories joins against
--
-- Rollback:
--   - `DROP INDEX idx_memories_content_tsv; ALTER TABLE memories DROP COLUMN
--     content_tsv;` returns the table to its current broken state. The legacy
--     keyword path will resume returning empty results (same as today).
--   - No data loss either way — column contains no information at the time of
--     migration.
--
-- Verification (post-apply):
--   SELECT COUNT(*) FILTER (WHERE content_tsv IS NULL) AS null_count,
--          COUNT(*) FILTER (WHERE content_tsv IS NOT NULL) AS populated_count,
--          COUNT(*) AS total
--   FROM memories;
--   -- Expected: null_count = 0, populated_count = total

BEGIN;

-- 1. Drop dependent index first (so DROP COLUMN doesn't trip on it).
DROP INDEX IF EXISTS public.idx_memories_content_tsv;

-- 2. Remove the broken column.
ALTER TABLE public.memories DROP COLUMN IF EXISTS content_tsv;

-- 3. Re-add as a STORED generated column. STORED is required so the value is
--    written on each row and indexed by the GIN below; the VIRTUAL form would
--    not be index-friendly.
ALTER TABLE public.memories
  ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- 4. Rebuild the GIN index that keyword_search_memories scans.
CREATE INDEX idx_memories_content_tsv
  ON public.memories USING GIN (content_tsv);

COMMIT;
