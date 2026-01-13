-- Migration: Summer Documents Enhanced Indexing
-- Adds columns and functions for the enhanced /index API

-- ============================================
-- 1. Add columns to summer_documents
-- ============================================

-- Add chunking_strategy column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'chunking_strategy'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN chunking_strategy VARCHAR(50) DEFAULT 'sliding_window';
  END IF;
END $$;

-- Add embedding_model column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'embedding_model'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN embedding_model VARCHAR(50) DEFAULT 'voyage-3';
  END IF;
END $$;

-- Add chunk_count column (denormalized for quick access)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'chunk_count'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN chunk_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add total_tokens column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'total_tokens'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN total_tokens INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add mime_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'mime_type'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN mime_type VARCHAR(100);
  END IF;
END $$;

-- Add status column (for async processing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'status'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN status VARCHAR(20) DEFAULT 'indexed'
      CHECK (status IN ('pending', 'processing', 'indexed', 'failed'));
  END IF;
END $$;

-- Add error_message column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN error_message TEXT;
  END IF;
END $$;

-- ============================================
-- 2. Add columns to summer_chunks
-- ============================================

-- Add start_offset column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_chunks' AND column_name = 'start_offset'
  ) THEN
    ALTER TABLE summer_chunks ADD COLUMN start_offset INTEGER;
  END IF;
END $$;

-- Add end_offset column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_chunks' AND column_name = 'end_offset'
  ) THEN
    ALTER TABLE summer_chunks ADD COLUMN end_offset INTEGER;
  END IF;
END $$;

-- ============================================
-- 3. Create indexes for new columns
-- ============================================

CREATE INDEX IF NOT EXISTS idx_summer_documents_status
  ON summer_documents(status) WHERE status != 'indexed';

CREATE INDEX IF NOT EXISTS idx_summer_documents_content_hash
  ON summer_documents(content_hash) WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_summer_chunks_offsets
  ON summer_chunks(document_id, start_offset, end_offset)
  WHERE start_offset IS NOT NULL;

-- ============================================
-- 4. Indexing statistics view
-- ============================================

CREATE OR REPLACE VIEW summer_indexing_stats AS
SELECT
  c.id AS collection_id,
  c.name AS collection_name,
  c.user_id,
  COUNT(DISTINCT d.id) AS document_count,
  COUNT(ch.id) AS chunk_count,
  COALESCE(SUM(d.total_tokens), 0) AS total_tokens,
  COALESCE(AVG(ch.token_count), 0) AS avg_chunk_tokens,
  MIN(d.created_at) AS first_indexed_at,
  MAX(d.updated_at) AS last_updated_at
FROM summer_collections c
LEFT JOIN summer_documents d ON d.collection_id = c.id
LEFT JOIN summer_chunks ch ON ch.document_id = d.id
GROUP BY c.id, c.name, c.user_id;

COMMENT ON VIEW summer_indexing_stats IS 'Aggregated indexing statistics per collection';

-- ============================================
-- 5. Function to update document chunk count
-- ============================================

CREATE OR REPLACE FUNCTION update_document_chunk_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE summer_documents
    SET chunk_count = chunk_count + 1,
        total_tokens = total_tokens + COALESCE(NEW.token_count, 0)
    WHERE id = NEW.document_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE summer_documents
    SET chunk_count = GREATEST(0, chunk_count - 1),
        total_tokens = GREATEST(0, total_tokens - COALESCE(OLD.token_count, 0))
    WHERE id = OLD.document_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS summer_chunk_count_trigger ON summer_chunks;
CREATE TRIGGER summer_chunk_count_trigger
  AFTER INSERT OR DELETE ON summer_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_document_chunk_count();

-- ============================================
-- 6. Function to get document with chunks
-- ============================================

CREATE OR REPLACE FUNCTION get_document_with_chunks(
  p_document_id UUID,
  p_user_id TEXT
)
RETURNS TABLE (
  document_id UUID,
  external_id TEXT,
  title TEXT,
  source TEXT,
  status VARCHAR(20),
  chunk_count INTEGER,
  total_tokens INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  chunks JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS document_id,
    d.external_id,
    d.title,
    d.source,
    d.status,
    d.chunk_count,
    d.total_tokens,
    d.created_at,
    d.updated_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'chunk_id', c.id,
            'chunk_index', c.chunk_index,
            'content', c.content,
            'token_count', c.token_count,
            'start_offset', c.start_offset,
            'end_offset', c.end_offset
          ) ORDER BY c.chunk_index
        )
        FROM summer_chunks c
        WHERE c.document_id = d.id
      ),
      '[]'::jsonb
    ) AS chunks
  FROM summer_documents d
  WHERE d.id = p_document_id
    AND d.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Function to bulk delete documents
-- ============================================

CREATE OR REPLACE FUNCTION bulk_delete_documents(
  p_document_ids UUID[],
  p_user_id TEXT
)
RETURNS TABLE (
  deleted_count INTEGER,
  chunks_deleted INTEGER
) AS $$
DECLARE
  v_deleted_count INTEGER;
  v_chunks_deleted INTEGER;
BEGIN
  -- Count chunks to be deleted
  SELECT COUNT(*) INTO v_chunks_deleted
  FROM summer_chunks c
  JOIN summer_documents d ON c.document_id = d.id
  WHERE d.id = ANY(p_document_ids)
    AND d.user_id = p_user_id;

  -- Delete documents (chunks will cascade)
  WITH deleted AS (
    DELETE FROM summer_documents
    WHERE id = ANY(p_document_ids)
      AND user_id = p_user_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  RETURN QUERY SELECT v_deleted_count, v_chunks_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. Function to search chunks with document info
-- ============================================

CREATE OR REPLACE FUNCTION summer_search_chunks_with_docs(
  query_embedding vector(1024),
  match_user_id TEXT,
  match_collection_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  search_ef INT DEFAULT 40
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  external_id TEXT,
  document_title TEXT,
  document_source TEXT,
  content TEXT,
  chunk_index INT,
  metadata JSONB,
  similarity FLOAT,
  start_offset INT,
  end_offset INT
) AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search', search_ef::TEXT, true);

  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    d.external_id,
    d.title AS document_title,
    d.source AS document_source,
    c.content,
    c.chunk_index,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity,
    c.start_offset,
    c.end_offset
  FROM summer_chunks c
  JOIN summer_documents d ON c.document_id = d.id
  WHERE c.user_id = match_user_id
    AND c.collection_id = match_collection_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. Initialize existing documents
-- ============================================

-- Update chunk_count for existing documents
UPDATE summer_documents d
SET chunk_count = (
  SELECT COUNT(*) FROM summer_chunks c WHERE c.document_id = d.id
),
total_tokens = (
  SELECT COALESCE(SUM(token_count), 0) FROM summer_chunks c WHERE c.document_id = d.id
)
WHERE d.chunk_count IS NULL OR d.chunk_count = 0;

-- ============================================
-- Comments
-- ============================================

COMMENT ON COLUMN summer_documents.chunking_strategy IS 'Chunking strategy used: sliding_window, sentence, paragraph, semantic';
COMMENT ON COLUMN summer_documents.embedding_model IS 'Embedding model used: voyage-3, voyage-3-lite, voyage-code-3, voyage-finance-2';
COMMENT ON COLUMN summer_documents.chunk_count IS 'Denormalized count of chunks for this document';
COMMENT ON COLUMN summer_documents.total_tokens IS 'Total estimated tokens across all chunks';
COMMENT ON COLUMN summer_documents.status IS 'Document processing status';
COMMENT ON COLUMN summer_chunks.start_offset IS 'Start character offset in original document';
COMMENT ON COLUMN summer_chunks.end_offset IS 'End character offset in original document';

COMMENT ON FUNCTION get_document_with_chunks IS 'Get document details with all chunks as JSONB array';
COMMENT ON FUNCTION bulk_delete_documents IS 'Bulk delete documents and return counts';
COMMENT ON FUNCTION summer_search_chunks_with_docs IS 'Vector search with document metadata included';
