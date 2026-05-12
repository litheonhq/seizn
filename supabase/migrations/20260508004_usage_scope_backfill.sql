-- v9 audit follow-up — backfill 'usage' scope on existing api_keys.
--
-- PR #305 added 'usage' to v9 paid tier scope defaults so paid users can
-- call /api/v1/usage without 403. But existing api_keys rows from before
-- PR #305 don't have 'usage' in their scopes column — webhook only
-- rewrites scopes on tier transition (per audit fix #100), so paid users
-- stay scope_denied until they upgrade/downgrade tiers.
--
-- One-off backfill: add 'usage' to any active paid key whose scopes
-- include the v9 paid-tier marker scope 'check' (Free's four scopes
-- don't include it) OR the wildcard '*'. Rows already containing 'usage'
-- are left alone. Note: scopes is text[] (not JSONB), so we use ANY()
-- + array_append rather than the ? operator.

UPDATE public.api_keys
SET scopes = scopes || ARRAY['usage']
WHERE
  is_active = true
  AND revoked_at IS NULL
  AND ('check' = ANY(scopes) OR '*' = ANY(scopes))
  AND NOT ('usage' = ANY(scopes));
