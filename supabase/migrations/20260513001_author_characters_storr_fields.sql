-- Seizn Author Memory v3 — add Storr/Pressfield arc fields to author_characters.
-- Phase 2 (PR 1) of the Author Coach feature. Backed by the typed reference
-- library at src/lib/author/frameworks/ (see plan in the planning notes).
--
-- All columns are nullable so existing rows are unaffected. arc_direction is
-- constrained to the three values exported by frameworks/storr-arc.ts so
-- writers cannot persist a fourth direction by mistake.

ALTER TABLE author_characters
  ADD COLUMN IF NOT EXISTS sacred_flaw TEXT,
  ADD COLUMN IF NOT EXISTS internal_need TEXT,
  ADD COLUMN IF NOT EXISTS external_want TEXT,
  ADD COLUMN IF NOT EXISTS philosophical_purpose TEXT,
  ADD COLUMN IF NOT EXISTS arc_direction TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'author_characters_arc_direction_check'
      AND conrelid = 'public.author_characters'::regclass
  ) THEN
    ALTER TABLE author_characters
      ADD CONSTRAINT author_characters_arc_direction_check
      CHECK (arc_direction IS NULL OR arc_direction IN ('positive', 'negative', 'flat'));
  END IF;
END $$;

COMMENT ON COLUMN author_characters.sacred_flaw IS
  'Will Storr sacred flaw — fundamental misbelief the character clings to. See src/lib/author/frameworks/storr-arc.ts.';
COMMENT ON COLUMN author_characters.internal_need IS
  'What the character actually needs (usually the inverse of sacred_flaw).';
COMMENT ON COLUMN author_characters.external_want IS
  'What the character consciously pursues.';
COMMENT ON COLUMN author_characters.philosophical_purpose IS
  'Universal truth the character''s journey illuminates.';
COMMENT ON COLUMN author_characters.arc_direction IS
  'positive (transformation), negative (tragedy), or flat (changes world instead).';
