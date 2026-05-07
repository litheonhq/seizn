-- Enforce at most ONE default key per (user, provider) at the DB level.
--
-- Pre-audit, `saveAuthorByokKey` (src/lib/author/llm/byok-resolver.ts)
-- performed two sequential statements with no transaction wrapping:
--   1. UPDATE provider_keys SET is_default = false WHERE user_id = X AND provider = Y;
--   2. INSERT INTO provider_keys (..., is_default = true);
--
-- Two concurrent saves (user double-clicks, two browsers, retry storm)
-- interleave: T1 update, T2 update, T1 insert, T2 insert → two rows with
-- `is_default = true`. Subsequent reads via `getUserProviderKey` use
-- `.single()` on the default-key query, which throws on multiple rows;
-- the route swallows the error and returns null — the user falls back to
-- the managed key while their freshly-saved BYOK key sits unused, with
-- no UI signal about the silent regression.
--
-- This partial unique index turns the second concurrent INSERT into a
-- 23505 unique-violation, which the route already treats as a save
-- failure (returns AuthorLlmError 500). User retries; the next attempt's
-- UPDATE clears the previous winner's default, INSERT succeeds, no
-- silent multi-default state ever exists.
--
-- The index is partial — non-default rows are unconstrained, so users
-- can still keep historical / fallback keys around.
--
-- Pre-clean step (CRITICAL): the very race this index is meant to close
-- might have ALREADY written multi-default rows to production. CREATE
-- UNIQUE INDEX would FAIL on existing duplicates with code 23505 and
-- abort the migration. Before the index, demote all-but-one default per
-- (user_id, provider) — keep the most recently created one. This is
-- conservative (no data loss; keys remain active, just stop being the
-- "default" pick) and idempotent (running twice is a no-op).

WITH ranked_defaults AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, provider
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.provider_keys
  WHERE is_default = true
)
UPDATE public.provider_keys
SET is_default = false
WHERE id IN (SELECT id FROM ranked_defaults WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS provider_keys_default_per_user_provider_idx
  ON public.provider_keys (user_id, provider)
  WHERE is_default = true;

COMMENT ON INDEX public.provider_keys_default_per_user_provider_idx IS
  'Enforces at most one default key per (user_id, provider). Prevents the silent multi-default race that the audit (2026-05-07) found in saveAuthorByokKey.';
