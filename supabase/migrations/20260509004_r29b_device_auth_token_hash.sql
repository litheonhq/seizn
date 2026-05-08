CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.device_auth_codes
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT;

UPDATE public.device_auth_codes
SET access_token_hash = encode(digest(access_token, 'sha256'), 'hex')
WHERE access_token IS NOT NULL
  AND access_token_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_auth_codes_access_token_hash
  ON public.device_auth_codes(access_token_hash)
  WHERE access_token_hash IS NOT NULL;

COMMENT ON COLUMN public.device_auth_codes.access_token_hash IS
  'SHA-256 hash of the one-time device-flow API token. Plain access_token is retained only for active, not-yet-polled flows.';
