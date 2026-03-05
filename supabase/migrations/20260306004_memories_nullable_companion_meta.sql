-- Seizn compatibility patch: legacy API can send companion_meta = null

BEGIN;

ALTER TABLE public.memories ALTER COLUMN companion_meta DROP NOT NULL;

COMMIT;
