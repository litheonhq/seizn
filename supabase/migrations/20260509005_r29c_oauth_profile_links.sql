CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.oauth_profile_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_profile_links_profile
  ON public.oauth_profile_links (profile_id);

ALTER TABLE public.oauth_profile_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_profile_links_service_role_all ON public.oauth_profile_links;
CREATE POLICY oauth_profile_links_service_role_all
  ON public.oauth_profile_links
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.oauth_profile_links FROM anon;
REVOKE ALL ON public.oauth_profile_links FROM authenticated;
GRANT ALL ON public.oauth_profile_links TO service_role;

COMMENT ON TABLE public.oauth_profile_links IS
  'Server-only mapping from OAuth provider account IDs to random Seizn profile IDs. Provider subjects are never used as profile primary keys.';

COMMENT ON COLUMN public.oauth_profile_links.provider_account_id IS
  'Opaque provider account subject. Stored only in the service-role mapping table, not used as a profile ID.';

NOTIFY pgrst, 'reload schema';
