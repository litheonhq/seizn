-- ============================================================================
-- Multilingual Memory Support Migration
--
-- Extends the memory data model to support:
-- - Language detection and storage
-- - Canonical English representation for cross-lingual search
-- - Lexical tokens for language-specific search
-- - Phonetic tokens for fuzzy matching
-- - Entity mentions for NER
-- - Temporal knowledge graph features
--
-- Based on: Seizn_Multilingual_Intelligent_Memory_Tech_Expansion_Playbook.md
-- Created: 2026-02-05
-- ============================================================================

-- ============================================================================
-- 1. Add multilingual columns to spring_memory_notes
-- ============================================================================

-- Language code (BCP-47 format: en, hi, zh-Hans, uk, etc.)
ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT NULL;

-- Canonical English translation for cross-lingual search
ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS content_canonical_en TEXT DEFAULT NULL;

-- Embedding of the canonical English content (for cross-lingual search)
ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS embedding_canonical VECTOR(1024) DEFAULT NULL;

-- Lexical tokens from language-specific tokenization (JSONB array)
ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS lex_tokens JSONB DEFAULT '[]'::JSONB;

-- Phonetic tokens for fuzzy matching (Pinyin, romanization, etc.)
ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS phonetic_tokens JSONB DEFAULT '[]'::JSONB;

-- Detected entity mentions (JSONB array of {text, type, start, end, confidence})
ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS entity_mentions JSONB DEFAULT '[]'::JSONB;

-- Script type (latin, han_simplified, devanagari, cyrillic, etc.)
ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS script_type VARCHAR(20) DEFAULT NULL;

-- Language detection confidence (0-1)
ALTER TABLE spring_memory_notes
ADD COLUMN IF NOT EXISTS language_confidence FLOAT DEFAULT NULL;

-- ============================================================================
-- 2. Add temporal knowledge graph columns to spring_memory_edges
-- ============================================================================

-- Validity period for temporal facts
ALTER TABLE spring_memory_edges
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE spring_memory_edges
ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ DEFAULT NULL;

-- Confidence score for the relationship (0-1)
ALTER TABLE spring_memory_edges
ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 1.0;

-- ============================================================================
-- 3. Create fact invalidation tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS spring_fact_invalidations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  invalidated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_by UUID REFERENCES spring_memory_notes(id) ON DELETE SET NULL,
  reason TEXT,
  auto_invalidated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_fact_invalidations_memory_id
ON spring_fact_invalidations(memory_id);

CREATE INDEX IF NOT EXISTS idx_fact_invalidations_invalidated_at
ON spring_fact_invalidations(invalidated_at DESC);

-- ============================================================================
-- 4. Create language statistics table
-- ============================================================================

CREATE TABLE IF NOT EXISTS spring_language_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  language VARCHAR(10) NOT NULL,
  note_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, language)
);

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_language_stats_user_id
ON spring_language_stats(user_id);

-- ============================================================================
-- 5. Create indexes for multilingual search
-- ============================================================================

-- Index on language column for filtering
CREATE INDEX IF NOT EXISTS idx_spring_notes_language
ON spring_memory_notes(user_id, language)
WHERE status = 'active';

-- Index on script type for script-based queries
CREATE INDEX IF NOT EXISTS idx_spring_notes_script_type
ON spring_memory_notes(user_id, script_type)
WHERE status = 'active';

-- GIN index on entity mentions for entity search
CREATE INDEX IF NOT EXISTS idx_spring_notes_entity_mentions
ON spring_memory_notes USING GIN(entity_mentions)
WHERE status = 'active';

-- GIN index on lexical tokens for keyword search
CREATE INDEX IF NOT EXISTS idx_spring_notes_lex_tokens
ON spring_memory_notes USING GIN(lex_tokens)
WHERE status = 'active';

-- GIN index on phonetic tokens for fuzzy search
CREATE INDEX IF NOT EXISTS idx_spring_notes_phonetic_tokens
ON spring_memory_notes USING GIN(phonetic_tokens)
WHERE status = 'active';

-- Index on validity period for temporal queries
CREATE INDEX IF NOT EXISTS idx_spring_notes_validity
ON spring_memory_notes(user_id, valid_from, valid_to)
WHERE status = 'active' AND valid_to IS NOT NULL;

-- HNSW index on canonical embedding for cross-lingual search
CREATE INDEX IF NOT EXISTS idx_spring_notes_embedding_canonical
ON spring_memory_notes
USING hnsw(embedding_canonical vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding_canonical IS NOT NULL;

-- ============================================================================
-- 6. Create helper functions
-- ============================================================================

-- Function to update language statistics
CREATE OR REPLACE FUNCTION update_language_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.language IS NOT NULL THEN
    INSERT INTO spring_language_stats (user_id, language, note_count, last_used_at)
    VALUES (NEW.user_id, NEW.language, 1, NOW())
    ON CONFLICT (user_id, language)
    DO UPDATE SET
      note_count = spring_language_stats.note_count + 1,
      last_used_at = NOW(),
      updated_at = NOW();
  ELSIF TG_OP = 'DELETE' AND OLD.language IS NOT NULL THEN
    UPDATE spring_language_stats
    SET note_count = GREATEST(0, note_count - 1),
        updated_at = NOW()
    WHERE user_id = OLD.user_id AND language = OLD.language;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain language statistics
DROP TRIGGER IF EXISTS trg_update_language_stats ON spring_memory_notes;
CREATE TRIGGER trg_update_language_stats
AFTER INSERT OR DELETE ON spring_memory_notes
FOR EACH ROW EXECUTE FUNCTION update_language_stats();

-- Function to process expired facts
CREATE OR REPLACE FUNCTION process_expired_facts()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE spring_memory_notes
  SET status = 'expired'
  WHERE status = 'active'
    AND valid_to IS NOT NULL
    AND valid_to < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to search with cross-lingual support
CREATE OR REPLACE FUNCTION search_memories_crosslingual(
  p_user_id TEXT,
  p_query_embedding VECTOR(1024),
  p_language VARCHAR(10) DEFAULT NULL,
  p_use_canonical BOOLEAN DEFAULT TRUE,
  p_limit INT DEFAULT 20,
  p_min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  language VARCHAR(10),
  similarity FLOAT,
  search_mode TEXT
) AS $$
BEGIN
  IF p_use_canonical THEN
    -- Cross-lingual search using canonical embeddings
    RETURN QUERY
    WITH direct_matches AS (
      SELECT
        n.id,
        n.content,
        n.language,
        1 - (n.embedding <=> p_query_embedding) AS similarity,
        'direct'::TEXT AS search_mode
      FROM spring_memory_notes n
      WHERE n.user_id = p_user_id
        AND n.status = 'active'
        AND (p_language IS NULL OR n.language = p_language)
      ORDER BY n.embedding <=> p_query_embedding
      LIMIT p_limit
    ),
    canonical_matches AS (
      SELECT
        n.id,
        n.content,
        n.language,
        1 - (n.embedding_canonical <=> p_query_embedding) AS similarity,
        'canonical'::TEXT AS search_mode
      FROM spring_memory_notes n
      WHERE n.user_id = p_user_id
        AND n.status = 'active'
        AND n.embedding_canonical IS NOT NULL
        AND (p_language IS NULL OR n.language = p_language)
      ORDER BY n.embedding_canonical <=> p_query_embedding
      LIMIT p_limit
    ),
    combined AS (
      SELECT * FROM direct_matches
      UNION ALL
      SELECT * FROM canonical_matches
    )
    SELECT DISTINCT ON (combined.id)
      combined.id,
      combined.content,
      combined.language,
      combined.similarity,
      combined.search_mode
    FROM combined
    WHERE combined.similarity >= p_min_similarity
    ORDER BY combined.id, combined.similarity DESC
    LIMIT p_limit;
  ELSE
    -- Direct embedding search only
    RETURN QUERY
    SELECT
      n.id,
      n.content,
      n.language,
      (1 - (n.embedding <=> p_query_embedding))::FLOAT AS similarity,
      'direct'::TEXT AS search_mode
    FROM spring_memory_notes n
    WHERE n.user_id = p_user_id
      AND n.status = 'active'
      AND (p_language IS NULL OR n.language = p_language)
      AND (1 - (n.embedding <=> p_query_embedding)) >= p_min_similarity
    ORDER BY n.embedding <=> p_query_embedding
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Comments
-- ============================================================================

COMMENT ON COLUMN spring_memory_notes.language IS 'BCP-47 language code (e.g., en, hi, zh-Hans)';
COMMENT ON COLUMN spring_memory_notes.content_canonical_en IS 'Canonical English translation for cross-lingual search';
COMMENT ON COLUMN spring_memory_notes.embedding_canonical IS 'Embedding of canonical English content';
COMMENT ON COLUMN spring_memory_notes.lex_tokens IS 'Language-specific lexical tokens for keyword search';
COMMENT ON COLUMN spring_memory_notes.phonetic_tokens IS 'Phonetic tokens (Pinyin, romanization) for fuzzy matching';
COMMENT ON COLUMN spring_memory_notes.entity_mentions IS 'Detected named entities with positions and types';
COMMENT ON COLUMN spring_memory_notes.script_type IS 'Writing system script type (latin, han_simplified, etc.)';
COMMENT ON COLUMN spring_memory_notes.language_confidence IS 'Confidence score of language detection (0-1)';

COMMENT ON COLUMN spring_memory_edges.valid_from IS 'Start of validity period for temporal facts';
COMMENT ON COLUMN spring_memory_edges.valid_to IS 'End of validity period for temporal facts';
COMMENT ON COLUMN spring_memory_edges.confidence IS 'Confidence score for the relationship (0-1)';

COMMENT ON TABLE spring_fact_invalidations IS 'Tracks invalidation history of memory facts';
COMMENT ON TABLE spring_language_stats IS 'Per-user language usage statistics';

COMMENT ON FUNCTION search_memories_crosslingual IS 'Cross-lingual semantic search supporting both direct and canonical embeddings';
COMMENT ON FUNCTION process_expired_facts IS 'Marks expired facts based on valid_to timestamp';
