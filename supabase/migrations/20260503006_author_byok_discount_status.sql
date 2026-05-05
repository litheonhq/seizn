-- Author launch Phase B double-prime: explicit BYOK discount sync state.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS byok_discount_status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS byok_discount_error TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_byok_discount_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_byok_discount_status_check
  CHECK (byok_discount_status IN ('inactive', 'pending', 'applied', 'error'));

UPDATE public.profiles
SET byok_discount_status = CASE
  WHEN byok_discount_active IS TRUE THEN 'applied'
  WHEN byok_discount_coupon IS NOT NULL THEN 'pending'
  ELSE 'inactive'
END
WHERE byok_discount_status IS NULL;

UPDATE public.profiles
SET byok_discount_status = 'applied'
WHERE byok_discount_active IS TRUE;

UPDATE public.profiles
SET byok_discount_status = 'pending'
WHERE byok_discount_active IS NOT TRUE
  AND byok_discount_coupon IS NOT NULL;

COMMENT ON COLUMN public.profiles.byok_discount_status IS
  'Explicit BYOK discount sync state: inactive, pending, applied, or error.';
COMMENT ON COLUMN public.profiles.byok_discount_error IS
  'Last BYOK discount sync error, if Stripe coupon application or removal failed.';
