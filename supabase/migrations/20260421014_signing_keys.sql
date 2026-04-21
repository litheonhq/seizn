-- 20260421014_signing_keys.sql
-- Per-studio Ed25519 key material for signed portable save files.

CREATE TABLE IF NOT EXISTS public.studio_signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  public_key_base64 TEXT NOT NULL,
  private_key_ciphertext_base64 TEXT NOT NULL,
  private_key_iv_base64 TEXT NOT NULL,
  private_key_tag_base64 TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'ed25519-aes-256-gcm',
  active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  UNIQUE (studio_id)
);

CREATE INDEX IF NOT EXISTS studio_signing_keys_active_idx
  ON public.studio_signing_keys (studio_id, active);

ALTER TABLE public.studio_signing_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages studio signing keys" ON public.studio_signing_keys;
CREATE POLICY "Service role manages studio signing keys"
  ON public.studio_signing_keys FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members can view public signing keys" ON public.studio_signing_keys;

REVOKE ALL ON public.studio_signing_keys FROM anon, authenticated, public;
GRANT ALL ON public.studio_signing_keys TO service_role;

COMMENT ON TABLE public.studio_signing_keys IS
  'Encrypted Ed25519 signing keys for SZN1 portable save files.';
COMMENT ON COLUMN public.studio_signing_keys.public_key_base64 IS
  'Raw 32-byte Ed25519 public key encoded as base64.';
COMMENT ON COLUMN public.studio_signing_keys.private_key_ciphertext_base64 IS
  'AES-256-GCM encrypted PKCS8 private key encoded as base64.';

NOTIFY pgrst, 'reload schema';
