ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS age_bracket TEXT;

ALTER TABLE public.memories
  DROP CONSTRAINT IF EXISTS memories_subject_or_minor_encrypted_check;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_subject_or_minor_encrypted_check
  CHECK (
    COALESCE(is_encrypted, FALSE) = TRUE
    OR (
      subject_id IS NULL
      AND lower(COALESCE(age_bracket, 'unknown')) NOT IN ('minor', 'minor_under_13', 'minor_13_17')
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT memories_subject_or_minor_encrypted_check ON public.memories IS
  'R29.C: new or updated subject-keyed or minor memories must be encrypted. NOT VALID preserves existing production rows until a reviewed cleanup pass validates the constraint.';

COMMENT ON COLUMN public.memories.age_bracket IS
  'Age bracket attached to a memory write. Minor brackets require is_encrypted=true by memories_subject_or_minor_encrypted_check.';

NOTIFY pgrst, 'reload schema';
