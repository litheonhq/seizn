-- ============================================================================
-- Content Alt Migration
--
-- Adds content_alt JSONB column to spring_memory_notes for storing
-- alternative script representations (e.g., simplified/traditional Chinese,
-- romanized Hindi, romanized Ukrainian).
--
-- Used for cross-script search: queries in one script can match
-- memories stored in another script of the same language.
--
-- Created: 2026-02-06
-- ============================================================================

-- ============================================================================
-- 1. Add content_alt column
-- ============================================================================

ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS content_alt JSONB DEFAULT '{}'::JSONB;

COMMENT ON COLUMN spring_memory_notes.content_alt IS
  'Alternative script representations for cross-script search. Keys: zh_hans, zh_hant, romanized, etc.';

-- ============================================================================
-- 2. PGroonga index on romanized representation
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'pgroonga') THEN
    -- Index on the romanized text for Latin-script queries matching non-Latin memories
    CREATE INDEX IF NOT EXISTS idx_spring_notes_pgroonga_alt_romanized
    ON spring_memory_notes
    USING pgroonga((content_alt->>'romanized'))
    WITH (
      tokenizer = 'TokenBigramSplitSymbolAlphaDigit'
    )
    WHERE status = 'active'
      AND content_alt->>'romanized' IS NOT NULL;

    -- Index on simplified Chinese variant
    CREATE INDEX IF NOT EXISTS idx_spring_notes_pgroonga_alt_zh_hans
    ON spring_memory_notes
    USING pgroonga((content_alt->>'zh_hans'))
    WITH (
      tokenizer = 'TokenBigramSplitSymbolAlphaDigit'
    )
    WHERE status = 'active'
      AND content_alt->>'zh_hans' IS NOT NULL;

    -- Index on traditional Chinese variant
    CREATE INDEX IF NOT EXISTS idx_spring_notes_pgroonga_alt_zh_hant
    ON spring_memory_notes
    USING pgroonga((content_alt->>'zh_hant'))
    WITH (
      tokenizer = 'TokenBigramSplitSymbolAlphaDigit'
    )
    WHERE status = 'active'
      AND content_alt->>'zh_hant' IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping content_alt PGroonga indexes because pgroonga is unavailable';
  END IF;
END $$;

-- ============================================================================
-- 3. GIN index for generic JSONB key lookups on content_alt
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_spring_notes_content_alt_gin
ON spring_memory_notes USING GIN(content_alt)
WHERE status = 'active';
