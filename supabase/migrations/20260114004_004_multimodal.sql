-- Migration: 070_multimodal.sql
-- Phase C2: Multimodal Document Processing
-- Enables structured parsing of PDFs, images, tables, and complex documents

-- ============================================
-- 0. Prerequisites
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. Parsed Documents Table
-- ============================================

CREATE TABLE IF NOT EXISTS parsed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID, -- Optional: link to summer_collections

  -- Document identification
  filename TEXT NOT NULL,
  original_filename TEXT, -- Preserved original name with special chars
  external_id TEXT, -- For linking to external systems

  -- Document properties
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    -- Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    -- Images
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/tiff',
    'image/svg+xml',

    -- Text
    'text/plain',
    'text/markdown',
    'text/html',
    'text/csv',

    -- Data
    'application/json',
    'application/xml',

    -- Other
    'application/octet-stream'
  )),

  page_count INTEGER,
  file_size_bytes INTEGER,

  -- Processing info
  parser_used TEXT DEFAULT 'unstructured', -- unstructured, docling, llamaparse, etc.
  parser_version TEXT,
  parsing_duration_ms INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'parsed',
    'embedding',
    'completed',
    'failed'
  )),
  error_message TEXT,

  -- Extracted metadata
  title TEXT,
  author TEXT,
  language TEXT,
  creation_date TIMESTAMPTZ,
  modification_date TIMESTAMPTZ,

  -- Storage references
  storage_path TEXT, -- Path in Supabase Storage
  thumbnail_path TEXT, -- Path to document thumbnail

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Document Blocks Table
-- ============================================

CREATE TABLE IF NOT EXISTS document_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES parsed_documents(id) ON DELETE CASCADE,
  collection_id UUID, -- Denormalized for query efficiency

  -- Block classification
  block_type TEXT NOT NULL CHECK (block_type IN (
    -- Text blocks
    'text',           -- Generic text paragraph
    'heading',        -- Section headings
    'title',          -- Document title
    'abstract',       -- Document abstract
    'list',           -- Bullet/numbered lists
    'list_item',      -- Individual list item
    'quote',          -- Block quotes
    'footnote',       -- Footnotes
    'caption',        -- Figure/table captions

    -- Structured blocks
    'table',          -- Tables
    'code',           -- Code blocks
    'formula',        -- Mathematical formulas
    'equation',       -- Equations

    -- Visual blocks
    'figure',         -- Images/diagrams
    'chart',          -- Charts/graphs
    'logo',           -- Logos
    'signature',      -- Signatures

    -- Layout blocks
    'header',         -- Page header
    'footer',         -- Page footer
    'sidebar',        -- Sidebars
    'page_break',     -- Page breaks

    -- Other
    'metadata',       -- Document metadata
    'unknown'         -- Unclassified
  )),

  -- Location in document
  page_number INTEGER,
  block_index INTEGER, -- Order within the document
  section_id TEXT, -- Hierarchical section identifier (e.g., "1.2.3")
  parent_block_id UUID REFERENCES document_blocks(id) ON DELETE SET NULL,

  -- Bounding box (for visual documents)
  bbox JSONB, -- {x, y, width, height} in pixels

  -- Content
  content TEXT NOT NULL, -- Plain text content
  content_html TEXT, -- HTML representation (for tables, lists)
  content_markdown TEXT, -- Markdown representation

  -- For tables
  table_data JSONB, -- Structured table as {headers: [], rows: [[]]}
  row_count INTEGER,
  col_count INTEGER,

  -- For figures/images
  image_path TEXT, -- Path to extracted image
  image_description TEXT, -- Generated description
  image_ocr_text TEXT, -- OCR extracted text

  -- Semantic representation
  embedding VECTOR(1024),
  token_count INTEGER,

  -- Confidence
  confidence DECIMAL(3, 2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),

  -- Metadata
  metadata JSONB DEFAULT '{}', -- Style info, fonts, colors, etc.

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. Block References (Cross-references)
-- ============================================

CREATE TABLE IF NOT EXISTS block_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_block_id UUID NOT NULL REFERENCES document_blocks(id) ON DELETE CASCADE,
  target_block_id UUID NOT NULL REFERENCES document_blocks(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL CHECK (reference_type IN (
    'citation',       -- Academic citation
    'figure_ref',     -- Reference to figure
    'table_ref',      -- Reference to table
    'section_ref',    -- Reference to section
    'footnote_ref',   -- Reference to footnote
    'hyperlink',      -- Internal hyperlink
    'continuation'    -- Content continues in another block
  )),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_block_reference UNIQUE (source_block_id, target_block_id, reference_type)
);

-- ============================================
-- 4. Indexes
-- ============================================

-- Parsed documents indexes
CREATE INDEX IF NOT EXISTS idx_parsed_documents_user_id ON parsed_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_parsed_documents_collection ON parsed_documents(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parsed_documents_status ON parsed_documents(status);
CREATE INDEX IF NOT EXISTS idx_parsed_documents_mime_type ON parsed_documents(mime_type);
CREATE INDEX IF NOT EXISTS idx_parsed_documents_filename ON parsed_documents(filename);
CREATE INDEX IF NOT EXISTS idx_parsed_documents_external_id ON parsed_documents(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parsed_documents_created_at ON parsed_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parsed_documents_metadata ON parsed_documents USING GIN(metadata);

-- Document blocks indexes
CREATE INDEX IF NOT EXISTS idx_document_blocks_user_id ON document_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_document_blocks_document ON document_blocks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_blocks_collection ON document_blocks(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_blocks_type ON document_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_document_blocks_page ON document_blocks(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_blocks_section ON document_blocks(document_id, section_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_blocks_parent ON document_blocks(parent_block_id) WHERE parent_block_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_blocks_created_at ON document_blocks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_blocks_metadata ON document_blocks USING GIN(metadata);

-- Block vector index (HNSW)
CREATE INDEX IF NOT EXISTS idx_document_blocks_embedding ON document_blocks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Block references indexes
CREATE INDEX IF NOT EXISTS idx_block_references_source ON block_references(source_block_id);
CREATE INDEX IF NOT EXISTS idx_block_references_target ON block_references(target_block_id);
CREATE INDEX IF NOT EXISTS idx_block_references_type ON block_references(reference_type);

-- ============================================
-- 5. Row Level Security
-- ============================================

ALTER TABLE parsed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_references ENABLE ROW LEVEL SECURITY;

-- Parsed documents policies
CREATE POLICY "Users can view own parsed documents"
  ON parsed_documents FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own parsed documents"
  ON parsed_documents FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own parsed documents"
  ON parsed_documents FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own parsed documents"
  ON parsed_documents FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to parsed documents"
  ON parsed_documents FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- Document blocks policies
CREATE POLICY "Users can view own document blocks"
  ON document_blocks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own document blocks"
  ON document_blocks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own document blocks"
  ON document_blocks FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own document blocks"
  ON document_blocks FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to document blocks"
  ON document_blocks FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- Block references policies (based on source block ownership)
CREATE POLICY "Users can view own block references"
  ON block_references FOR SELECT
  USING (
    source_block_id IN (SELECT id FROM document_blocks WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own block references"
  ON block_references FOR INSERT
  WITH CHECK (
    source_block_id IN (SELECT id FROM document_blocks WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own block references"
  ON block_references FOR DELETE
  USING (
    source_block_id IN (SELECT id FROM document_blocks WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role has full access to block references"
  ON block_references FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- ============================================
-- 6. Updated_at Trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_parsed_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS parsed_documents_updated_at ON parsed_documents;
CREATE TRIGGER parsed_documents_updated_at
  BEFORE UPDATE ON parsed_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_parsed_documents_updated_at();

-- ============================================
-- 7. RPC Functions
-- ============================================

-- Vector similarity search for document blocks
CREATE OR REPLACE FUNCTION match_document_blocks(
  query_embedding VECTOR(1024),
  match_user_id UUID,
  match_collection_id UUID DEFAULT NULL,
  match_document_id UUID DEFAULT NULL,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  filter_block_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  document_filename TEXT,
  block_type TEXT,
  page_number INTEGER,
  section_id TEXT,
  content TEXT,
  content_html TEXT,
  table_data JSONB,
  image_description TEXT,
  confidence DECIMAL(3, 2),
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.document_id,
    d.filename AS document_filename,
    b.block_type,
    b.page_number,
    b.section_id,
    b.content,
    b.content_html,
    b.table_data,
    b.image_description,
    b.confidence,
    (1 - (b.embedding <=> query_embedding))::FLOAT AS similarity,
    b.metadata
  FROM document_blocks b
  JOIN parsed_documents d ON b.document_id = d.id
  WHERE b.user_id = match_user_id
    AND b.embedding IS NOT NULL
    AND (match_collection_id IS NULL OR b.collection_id = match_collection_id)
    AND (match_document_id IS NULL OR b.document_id = match_document_id)
    AND (filter_block_types IS NULL OR b.block_type = ANY(filter_block_types))
    AND (1 - (b.embedding <=> query_embedding)) > match_threshold
  ORDER BY b.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Get document structure (outline)
CREATE OR REPLACE FUNCTION get_document_structure(
  p_document_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  block_id UUID,
  block_type TEXT,
  page_number INTEGER,
  section_id TEXT,
  content_preview TEXT,
  children_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS block_id,
    b.block_type,
    b.page_number,
    b.section_id,
    LEFT(b.content, 100) AS content_preview,
    (SELECT COUNT(*) FROM document_blocks child WHERE child.parent_block_id = b.id)::BIGINT AS children_count
  FROM document_blocks b
  WHERE b.document_id = p_document_id
    AND b.user_id = p_user_id
    AND b.block_type IN ('title', 'heading', 'abstract')
  ORDER BY b.block_index;
END;
$$;

-- Get all blocks for a page
CREATE OR REPLACE FUNCTION get_page_blocks(
  p_document_id UUID,
  p_page_number INTEGER,
  p_user_id UUID
)
RETURNS TABLE (
  block_id UUID,
  block_type TEXT,
  block_index INTEGER,
  section_id TEXT,
  bbox JSONB,
  content TEXT,
  content_html TEXT,
  table_data JSONB,
  image_path TEXT,
  image_description TEXT,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS block_id,
    b.block_type,
    b.block_index,
    b.section_id,
    b.bbox,
    b.content,
    b.content_html,
    b.table_data,
    b.image_path,
    b.image_description,
    b.metadata
  FROM document_blocks b
  WHERE b.document_id = p_document_id
    AND b.page_number = p_page_number
    AND b.user_id = p_user_id
  ORDER BY b.block_index;
END;
$$;

-- Get tables from document
CREATE OR REPLACE FUNCTION get_document_tables(
  p_document_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  block_id UUID,
  page_number INTEGER,
  section_id TEXT,
  table_data JSONB,
  row_count INTEGER,
  col_count INTEGER,
  caption TEXT,
  content_markdown TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS block_id,
    t.page_number,
    t.section_id,
    t.table_data,
    t.row_count,
    t.col_count,
    -- Get caption if exists
    (
      SELECT c.content
      FROM document_blocks c
      JOIN block_references r ON r.source_block_id = c.id AND r.target_block_id = t.id
      WHERE r.reference_type = 'table_ref' AND c.block_type = 'caption'
      LIMIT 1
    ) AS caption,
    t.content_markdown
  FROM document_blocks t
  WHERE t.document_id = p_document_id
    AND t.user_id = p_user_id
    AND t.block_type = 'table'
  ORDER BY t.page_number, t.block_index;
END;
$$;

-- Get figures/images from document
CREATE OR REPLACE FUNCTION get_document_figures(
  p_document_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  block_id UUID,
  page_number INTEGER,
  section_id TEXT,
  image_path TEXT,
  image_description TEXT,
  image_ocr_text TEXT,
  caption TEXT,
  bbox JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id AS block_id,
    f.page_number,
    f.section_id,
    f.image_path,
    f.image_description,
    f.image_ocr_text,
    -- Get caption if exists
    (
      SELECT c.content
      FROM document_blocks c
      JOIN block_references r ON r.source_block_id = c.id AND r.target_block_id = f.id
      WHERE r.reference_type = 'figure_ref' AND c.block_type = 'caption'
      LIMIT 1
    ) AS caption,
    f.bbox
  FROM document_blocks f
  WHERE f.document_id = p_document_id
    AND f.user_id = p_user_id
    AND f.block_type IN ('figure', 'chart', 'logo')
  ORDER BY f.page_number, f.block_index;
END;
$$;

-- Update document status
CREATE OR REPLACE FUNCTION update_document_parsing_status(
  p_document_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE parsed_documents
  SET
    status = p_status,
    error_message = CASE WHEN p_status = 'failed' THEN p_error_message ELSE NULL END,
    parsed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE parsed_at END
  WHERE id = p_document_id;
END;
$$;

-- Get document with all blocks
CREATE OR REPLACE FUNCTION get_parsed_document_with_blocks(
  p_document_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  document JSONB,
  blocks JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    jsonb_build_object(
      'id', d.id,
      'filename', d.filename,
      'mime_type', d.mime_type,
      'page_count', d.page_count,
      'file_size_bytes', d.file_size_bytes,
      'parser_used', d.parser_used,
      'status', d.status,
      'title', d.title,
      'author', d.author,
      'language', d.language,
      'storage_path', d.storage_path,
      'thumbnail_path', d.thumbnail_path,
      'metadata', d.metadata,
      'parsed_at', d.parsed_at,
      'created_at', d.created_at
    ) AS document,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'block_type', b.block_type,
            'page_number', b.page_number,
            'block_index', b.block_index,
            'section_id', b.section_id,
            'bbox', b.bbox,
            'content', b.content,
            'content_html', b.content_html,
            'table_data', b.table_data,
            'image_path', b.image_path,
            'image_description', b.image_description,
            'confidence', b.confidence,
            'metadata', b.metadata
          ) ORDER BY b.block_index
        )
        FROM document_blocks b
        WHERE b.document_id = d.id
      ),
      '[]'::jsonb
    ) AS blocks
  FROM parsed_documents d
  WHERE d.id = p_document_id
    AND d.user_id = p_user_id;
END;
$$;

-- Get multimodal document statistics
CREATE OR REPLACE FUNCTION get_multimodal_stats(
  p_user_id UUID,
  p_collection_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_documents BIGINT,
  total_blocks BIGINT,
  total_pages BIGINT,
  documents_by_mime_type JSONB,
  blocks_by_type JSONB,
  total_tables BIGINT,
  total_figures BIGINT,
  avg_blocks_per_document FLOAT,
  status_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM parsed_documents d
     WHERE d.user_id = p_user_id
     AND (p_collection_id IS NULL OR d.collection_id = p_collection_id))::BIGINT AS total_documents,

    (SELECT COUNT(*) FROM document_blocks b
     WHERE b.user_id = p_user_id
     AND (p_collection_id IS NULL OR b.collection_id = p_collection_id))::BIGINT AS total_blocks,

    (SELECT COALESCE(SUM(page_count), 0) FROM parsed_documents d
     WHERE d.user_id = p_user_id
     AND (p_collection_id IS NULL OR d.collection_id = p_collection_id))::BIGINT AS total_pages,

    (SELECT COALESCE(jsonb_object_agg(mime_type, cnt), '{}'::jsonb)
     FROM (SELECT mime_type, COUNT(*) AS cnt FROM parsed_documents
           WHERE user_id = p_user_id
           AND (p_collection_id IS NULL OR collection_id = p_collection_id)
           GROUP BY mime_type) sub) AS documents_by_mime_type,

    (SELECT COALESCE(jsonb_object_agg(block_type, cnt), '{}'::jsonb)
     FROM (SELECT block_type, COUNT(*) AS cnt FROM document_blocks
           WHERE user_id = p_user_id
           AND (p_collection_id IS NULL OR collection_id = p_collection_id)
           GROUP BY block_type) sub) AS blocks_by_type,

    (SELECT COUNT(*) FROM document_blocks b
     WHERE b.user_id = p_user_id
     AND b.block_type = 'table'
     AND (p_collection_id IS NULL OR b.collection_id = p_collection_id))::BIGINT AS total_tables,

    (SELECT COUNT(*) FROM document_blocks b
     WHERE b.user_id = p_user_id
     AND b.block_type IN ('figure', 'chart')
     AND (p_collection_id IS NULL OR b.collection_id = p_collection_id))::BIGINT AS total_figures,

    (SELECT COALESCE(
      (SELECT COUNT(*)::FLOAT FROM document_blocks b
       WHERE b.user_id = p_user_id
       AND (p_collection_id IS NULL OR b.collection_id = p_collection_id)) /
      NULLIF((SELECT COUNT(*)::FLOAT FROM parsed_documents d
              WHERE d.user_id = p_user_id
              AND (p_collection_id IS NULL OR d.collection_id = p_collection_id)), 0),
      0
    ))::FLOAT AS avg_blocks_per_document,

    (SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
     FROM (SELECT status, COUNT(*) AS cnt FROM parsed_documents
           WHERE user_id = p_user_id
           AND (p_collection_id IS NULL OR collection_id = p_collection_id)
           GROUP BY status) sub) AS status_breakdown;
END;
$$;

-- ============================================
-- 8. Comments
-- ============================================

COMMENT ON TABLE parsed_documents IS 'Phase C2: Multimodal - Parsed document metadata and processing status';
COMMENT ON COLUMN parsed_documents.mime_type IS 'Document MIME type: pdf, docx, images, etc.';
COMMENT ON COLUMN parsed_documents.parser_used IS 'Parser used: unstructured, docling, llamaparse';
COMMENT ON COLUMN parsed_documents.status IS 'Processing status: pending, processing, parsed, embedding, completed, failed';

COMMENT ON TABLE document_blocks IS 'Phase C2: Multimodal - Extracted document blocks (text, tables, figures)';
COMMENT ON COLUMN document_blocks.block_type IS 'Block classification: text, heading, table, figure, code, etc.';
COMMENT ON COLUMN document_blocks.bbox IS 'Bounding box for visual positioning: {x, y, width, height}';
COMMENT ON COLUMN document_blocks.table_data IS 'Structured table data: {headers: [], rows: [[]]}';
COMMENT ON COLUMN document_blocks.image_path IS 'Storage path for extracted image';
COMMENT ON COLUMN document_blocks.image_description IS 'AI-generated image description';

COMMENT ON TABLE block_references IS 'Cross-references between document blocks (citations, figure refs, etc.)';

COMMENT ON FUNCTION match_document_blocks IS 'Vector similarity search for document blocks';
COMMENT ON FUNCTION get_document_structure IS 'Get document outline (headings, titles)';
COMMENT ON FUNCTION get_page_blocks IS 'Get all blocks for a specific page';
COMMENT ON FUNCTION get_document_tables IS 'Get all tables from a document with captions';
COMMENT ON FUNCTION get_document_figures IS 'Get all figures/images from a document';
COMMENT ON FUNCTION get_parsed_document_with_blocks IS 'Get full document with all blocks as JSONB';
COMMENT ON FUNCTION get_multimodal_stats IS 'Get multimodal processing statistics';
