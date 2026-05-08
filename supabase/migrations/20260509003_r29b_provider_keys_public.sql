CREATE OR REPLACE VIEW public.provider_keys_public
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  org_id,
  provider,
  CASE
    WHEN key_hint IS NULL THEN NULL
    WHEN length(key_hint) >= 4 THEN right(key_hint, 4)
    ELSE NULL
  END AS key_last_4,
  is_active,
  is_default,
  last_used_at,
  usage_count,
  total_cost_usd,
  label,
  metadata,
  created_at,
  updated_at
FROM public.provider_keys;

GRANT SELECT ON public.provider_keys_public TO authenticated;
GRANT SELECT ON public.provider_keys_public TO service_role;

COMMENT ON VIEW public.provider_keys_public IS
  'Client-safe BYOK provider key view. Excludes key_encrypted and key_hint; exposes only key_last_4.';
