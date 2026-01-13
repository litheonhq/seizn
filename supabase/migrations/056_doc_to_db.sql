-- ============================================================
-- Doc-to-DB: Structure-First Document Ingestion
-- Feature #6: Extract tables, schemas, and structured data
--             from documents before vectorizing
-- ============================================================

-- ============================================================
-- 1. Document Structures Table
-- ============================================================
-- Extracted structures from documents (tables, schemas, lists, etc.)

CREATE TABLE IF NOT EXISTS document_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,  -- Reference to source document (summer_documents.id)
  collection_id UUID,         -- Optional collection reference

  -- Structure metadata
  structure_type TEXT NOT NULL CHECK (structure_type IN ('table', 'schema', 'list', 'hierarchy', 'key_value')),
  title TEXT,
  description TEXT,           -- LLM-generated description of the structure

  -- Structure content
  headers JSONB,              -- Column/field headers for tables
  rows JSONB,                 -- Data rows for tables/lists
  schema_def JSONB,           -- For schema type: field definitions
  raw_text TEXT,              -- Original text representation

  -- Source location
  source_page INTEGER,
  source_location JSONB,      -- Bounding box or position info { start_char, end_char, section }

  -- Metadata and embedding
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1024),     -- Embedding of structure summary (voyage-3 = 1024 dims)

  -- Statistics
  row_count INTEGER DEFAULT 0,
  column_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Structure Cells Table
-- ============================================================
-- Individual cells for granular search within structures

CREATE TABLE IF NOT EXISTS structure_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id UUID NOT NULL REFERENCES document_structures(id) ON DELETE CASCADE,

  -- Cell position
  row_index INTEGER NOT NULL,
  col_index INTEGER,          -- NULL for key_value or list types

  -- Cell content
  cell_key TEXT,              -- For key_value type: the key
  cell_value TEXT NOT NULL,

  -- Inferred data type
  data_type TEXT CHECK (data_type IN ('text', 'number', 'date', 'currency', 'percentage', 'boolean', 'email', 'url', 'phone', 'unknown')),

  -- Embedding for semantic search
  embedding VECTOR(1024),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. Indexes
-- ============================================================

-- Document structures indexes
CREATE INDEX IF NOT EXISTS idx_doc_structures_user ON document_structures(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_structures_document ON document_structures(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_structures_collection ON document_structures(collection_id);
CREATE INDEX IF NOT EXISTS idx_doc_structures_type ON document_structures(structure_type);
CREATE INDEX IF NOT EXISTS idx_doc_structures_created ON document_structures(created_at DESC);

-- Structure cells indexes
CREATE INDEX IF NOT EXISTS idx_structure_cells_structure ON structure_cells(structure_id);
CREATE INDEX IF NOT EXISTS idx_structure_cells_position ON structure_cells(structure_id, row_index, col_index);
CREATE INDEX IF NOT EXISTS idx_structure_cells_data_type ON structure_cells(data_type);
CREATE INDEX IF NOT EXISTS idx_structure_cells_key ON structure_cells(cell_key) WHERE cell_key IS NOT NULL;

-- GIN index for JSONB search
CREATE INDEX IF NOT EXISTS idx_doc_structures_metadata ON document_structures USING gin(metadata jsonb_path_ops);

-- ============================================================
-- 4. Vector Indexes (HNSW for semantic search)
-- ============================================================

-- Structure embeddings index
CREATE INDEX IF NOT EXISTS idx_doc_structures_embedding ON document_structures
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Cell embeddings index
CREATE INDEX IF NOT EXISTS idx_structure_cells_embedding ON structure_cells
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- 5. Row-Level Security
-- ============================================================

ALTER TABLE document_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE structure_cells ENABLE ROW LEVEL SECURITY;

-- Policies for document_structures
CREATE POLICY "Users can view their own structures"
  ON document_structures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own structures"
  ON document_structures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own structures"
  ON document_structures FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own structures"
  ON document_structures FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for structure_cells (linked to structure owner)
CREATE POLICY "Cells belong to user structures for select"
  ON structure_cells FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_structures
      WHERE id = structure_cells.structure_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Cells belong to user structures for insert"
  ON structure_cells FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_structures
      WHERE id = structure_cells.structure_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Cells belong to user structures for update"
  ON structure_cells FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM document_structures
      WHERE id = structure_cells.structure_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Cells belong to user structures for delete"
  ON structure_cells FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM document_structures
      WHERE id = structure_cells.structure_id
      AND user_id = auth.uid()
    )
  );

-- Service role bypass for all operations
CREATE POLICY "Service role has full access to structures"
  ON document_structures FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to cells"
  ON structure_cells FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 6. Search Functions
-- ============================================================

-- Semantic search within document structures
CREATE OR REPLACE FUNCTION search_document_structures(
  p_user_id UUID,
  p_query_embedding VECTOR(1024),
  p_collection_id UUID DEFAULT NULL,
  p_structure_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  collection_id UUID,
  structure_type TEXT,
  title TEXT,
  description TEXT,
  headers JSONB,
  rows JSONB,
  row_count INTEGER,
  column_count INTEGER,
  metadata JSONB,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.id,
    ds.document_id,
    ds.collection_id,
    ds.structure_type,
    ds.title,
    ds.description,
    ds.headers,
    ds.rows,
    ds.row_count,
    ds.column_count,
    ds.metadata,
    (1 - (ds.embedding <=> p_query_embedding))::FLOAT as similarity,
    ds.created_at
  FROM document_structures ds
  WHERE ds.user_id = p_user_id
    AND ds.embedding IS NOT NULL
    AND (p_collection_id IS NULL OR ds.collection_id = p_collection_id)
    AND (p_structure_type IS NULL OR ds.structure_type = p_structure_type)
    AND (1 - (ds.embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY ds.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Semantic search within structure cells
CREATE OR REPLACE FUNCTION search_structure_cells(
  p_user_id UUID,
  p_query_embedding VECTOR(1024),
  p_structure_id UUID DEFAULT NULL,
  p_data_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  structure_id UUID,
  row_index INTEGER,
  col_index INTEGER,
  cell_key TEXT,
  cell_value TEXT,
  data_type TEXT,
  similarity FLOAT,
  structure_title TEXT,
  structure_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.structure_id,
    sc.row_index,
    sc.col_index,
    sc.cell_key,
    sc.cell_value,
    sc.data_type,
    (1 - (sc.embedding <=> p_query_embedding))::FLOAT as similarity,
    ds.title as structure_title,
    ds.structure_type
  FROM structure_cells sc
  JOIN document_structures ds ON sc.structure_id = ds.id
  WHERE ds.user_id = p_user_id
    AND sc.embedding IS NOT NULL
    AND (p_structure_id IS NULL OR sc.structure_id = p_structure_id)
    AND (p_data_type IS NULL OR sc.data_type = p_data_type)
    AND (1 - (sc.embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY sc.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Get structure with all cells
CREATE OR REPLACE FUNCTION get_structure_with_cells(
  p_user_id UUID,
  p_structure_id UUID
)
RETURNS TABLE (
  structure_data JSONB,
  cells_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    row_to_json(ds.*)::JSONB as structure_data,
    COALESCE(
      (
        SELECT jsonb_agg(row_to_json(sc.*) ORDER BY sc.row_index, sc.col_index)
        FROM structure_cells sc
        WHERE sc.structure_id = ds.id
      ),
      '[]'::JSONB
    ) as cells_data
  FROM document_structures ds
  WHERE ds.id = p_structure_id
    AND ds.user_id = p_user_id;
END;
$$;

-- ============================================================
-- 7. Triggers
-- ============================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_document_structures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_document_structures_updated_at
  BEFORE UPDATE ON document_structures
  FOR EACH ROW
  EXECUTE FUNCTION update_document_structures_updated_at();

-- Update row/column count on structure update
CREATE OR REPLACE FUNCTION update_structure_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_row_count INTEGER;
  v_col_count INTEGER;
BEGIN
  -- Count from rows JSONB if present
  IF NEW.rows IS NOT NULL THEN
    NEW.row_count := jsonb_array_length(NEW.rows);
  END IF;

  -- Count from headers JSONB if present
  IF NEW.headers IS NOT NULL THEN
    NEW.column_count := jsonb_array_length(NEW.headers);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_structure_counts
  BEFORE INSERT OR UPDATE ON document_structures
  FOR EACH ROW
  EXECUTE FUNCTION update_structure_counts();

-- ============================================================
-- 8. Comments
-- ============================================================

COMMENT ON TABLE document_structures IS 'Extracted structured data (tables, schemas, lists) from documents';
COMMENT ON TABLE structure_cells IS 'Individual cells within structures for granular search';

COMMENT ON COLUMN document_structures.structure_type IS 'Type of structure: table, schema, list, hierarchy, key_value';
COMMENT ON COLUMN document_structures.headers IS 'Column headers for tables, field names for schemas';
COMMENT ON COLUMN document_structures.rows IS 'Data rows as JSONB array of arrays or objects';
COMMENT ON COLUMN document_structures.schema_def IS 'Schema definition with field types and constraints';
COMMENT ON COLUMN document_structures.source_location IS 'Location in source document: { start_char, end_char, section, page }';

COMMENT ON COLUMN structure_cells.data_type IS 'Inferred data type: text, number, date, currency, percentage, boolean, email, url, phone, unknown';
COMMENT ON COLUMN structure_cells.cell_key IS 'Key name for key_value structures';

COMMENT ON FUNCTION search_document_structures IS 'Semantic search across document structures by embedding similarity';
COMMENT ON FUNCTION search_structure_cells IS 'Semantic search across individual cells for granular value lookup';
COMMENT ON FUNCTION get_structure_with_cells IS 'Get complete structure with all cells in one query';
