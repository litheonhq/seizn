-- R9 — port Author Memory v3 temporal pattern to /api/v1/memories.
--
-- Locked 2026-05-08. Author Memory v3 already implements bi-temporal
-- supersession in src/lib/author/memory-v3/temporal.ts (canon FSM with
-- 7 states, asOf-based time-travel filtering, supersedes/invalidates
-- graph) — round 4 audit confirmed it. This migration exposes the same
-- model on the generic memories table so the v1 API can answer
-- "what was true at T?" the same way.
--
-- New columns on public.memories:
--   canon_status        TEXT  default 'canon'  CHECK in 7-status list
--   valid_at            TIMESTAMPTZ            when the fact became true
--                                              (NULL → fall back to created_at)
--   invalidated_at      TIMESTAMPTZ NULL       when it stopped being true
--   invalidated_by_id   UUID NULL              row that invalidated this
--   supersedes_id       UUID NULL              row that this one replaces
--
-- Backfill behavior: existing rows get canon_status='canon' (the row
-- "is true now"), valid_at = created_at, both invalidated/supersedes
-- NULL. No data is destroyed; the temporal layer is purely additive.
--
-- Index strategy:
--   - canon_status filter is the hot read (default GET excludes
--     non-canon) → btree on (user_id, canon_status, namespace).
--   - asOf time-travel queries use valid_at + invalidated_at → btree
--     on (user_id, valid_at) WHERE invalidated_at IS NULL covers the
--     "current" plane; full bi-temporal range queries fall back to
--     scan + index assist.
--   - graph traversal (supersedes_id / invalidated_by_id) → small
--     btree, sparse via partial index NOT NULL.
--
-- Rollback: ALTER TABLE public.memories DROP COLUMN canon_status,
--   valid_at, invalidated_at, invalidated_by_id, supersedes_id;
--   plus DROP INDEX on the new indexes.

BEGIN;

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS canon_status TEXT NOT NULL DEFAULT 'canon',
  ADD COLUMN IF NOT EXISTS valid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invalidated_by_id UUID,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID;

ALTER TABLE public.memories
  DROP CONSTRAINT IF EXISTS memories_canon_status_check;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_canon_status_check
  CHECK (canon_status IN (
    'canon',
    'candidate',
    'contradicted',
    'invalidated',
    'superseded',
    'retired',
    'past_only'
  ));

-- supersedes_id and invalidated_by_id reference other memories rows.
-- Use ON DELETE SET NULL because the parent row may be soft-deleted
-- separately, and we want the temporal graph to degrade gracefully
-- rather than cascade-destroy referenced history.
ALTER TABLE public.memories
  DROP CONSTRAINT IF EXISTS memories_supersedes_id_fkey;
ALTER TABLE public.memories
  ADD CONSTRAINT memories_supersedes_id_fkey
  FOREIGN KEY (supersedes_id) REFERENCES public.memories(id) ON DELETE SET NULL;

ALTER TABLE public.memories
  DROP CONSTRAINT IF EXISTS memories_invalidated_by_id_fkey;
ALTER TABLE public.memories
  ADD CONSTRAINT memories_invalidated_by_id_fkey
  FOREIGN KEY (invalidated_by_id) REFERENCES public.memories(id) ON DELETE SET NULL;

-- Backfill: seed valid_at on existing rows from created_at.
UPDATE public.memories
   SET valid_at = COALESCE(valid_at, created_at)
 WHERE valid_at IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memories_canon_status
  ON public.memories (user_id, canon_status, namespace)
  WHERE NOT COALESCE(is_deleted, FALSE);

CREATE INDEX IF NOT EXISTS idx_memories_temporal_current
  ON public.memories (user_id, valid_at DESC)
  WHERE invalidated_at IS NULL AND NOT COALESCE(is_deleted, FALSE);

CREATE INDEX IF NOT EXISTS idx_memories_supersedes_id
  ON public.memories (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_invalidated_by_id
  ON public.memories (invalidated_by_id)
  WHERE invalidated_by_id IS NOT NULL;

COMMENT ON COLUMN public.memories.canon_status IS
  'Bi-temporal canon FSM (R9). canon = current truth; candidate = pending review; contradicted/invalidated/superseded = no longer true; retired/past_only = explicitly set aside. See src/lib/temporal/v1.ts for the consumer.';
COMMENT ON COLUMN public.memories.valid_at IS
  'When this fact became true. Defaults to created_at on backfill. Powers asOf time-travel.';
COMMENT ON COLUMN public.memories.invalidated_at IS
  'When this fact stopped being true. NULL = still currently true. Set when a newer memory invalidates or supersedes this one.';

COMMIT;
