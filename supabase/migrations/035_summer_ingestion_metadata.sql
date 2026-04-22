-- Migration: Summer Ingestion Metadata
-- Stores extracted tables, equations, and layout information

-- Extracted tables
CREATE TABLE IF NOT EXISTS summer_extracted_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES summer_documents(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  table_index INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL,
  col_count INTEGER NOT NULL,
  headers JSONB DEFAULT '[]',
  cells JSONB NOT NULL DEFAULT '[]',
  markdown TEXT,
  caption TEXT,
  confidence FLOAT DEFAULT 0.8,
  bounds JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for tables
CREATE INDEX idx_summer_tables_document ON summer_extracted_tables(document_id);
CREATE INDEX idx_summer_tables_collection ON summer_extracted_tables(collection_id);
CREATE INDEX idx_summer_tables_page ON summer_extracted_tables(document_id, page_number);

-- Extracted equations
CREATE TABLE IF NOT EXISTS summer_extracted_equations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES summer_documents(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  line_number INTEGER,
  content TEXT NOT NULL,
  format VARCHAR(20) NOT NULL DEFAULT 'latex',
  normalized TEXT NOT NULL,
  is_inline BOOLEAN DEFAULT true,
  is_numbered BOOLEAN DEFAULT false,
  equation_number VARCHAR(50),
  confidence FLOAT DEFAULT 0.8,
  bounds JSONB,
  context_before TEXT,
  context_after TEXT,
  searchable_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for equations
CREATE INDEX idx_summer_equations_document ON summer_extracted_equations(document_id);
CREATE INDEX idx_summer_equations_collection ON summer_extracted_equations(collection_id);
CREATE INDEX idx_summer_equations_format ON summer_extracted_equations(format);
CREATE INDEX idx_summer_equations_searchable ON summer_extracted_equations USING gin(to_tsvector('english', searchable_text));

-- Document layout metadata
CREATE TABLE IF NOT EXISTS summer_document_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES summer_documents(id) ON DELETE CASCADE UNIQUE,
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,
  page_count INTEGER NOT NULL DEFAULT 1,
  detected_columns INTEGER DEFAULT 1,
  has_headers BOOLEAN DEFAULT false,
  has_footers BOOLEAN DEFAULT false,
  has_tables BOOLEAN DEFAULT false,
  has_equations BOOLEAN DEFAULT false,
  has_figures BOOLEAN DEFAULT false,
  layout_metadata JSONB DEFAULT '{}',
  zone_distribution JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for layouts
CREATE INDEX idx_summer_layouts_document ON summer_document_layouts(document_id);
CREATE INDEX idx_summer_layouts_collection ON summer_document_layouts(collection_id);

-- Chunk update history (for partial updates)
CREATE TABLE IF NOT EXISTS summer_chunk_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES summer_documents(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('added', 'modified', 'deleted')),
  old_content_hash VARCHAR(64),
  new_content_hash VARCHAR(64),
  old_content TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for chunk history
CREATE INDEX idx_summer_chunk_history_document ON summer_chunk_history(document_id);
CREATE INDEX idx_summer_chunk_history_chunk ON summer_chunk_history(chunk_id);
CREATE INDEX idx_summer_chunk_history_created ON summer_chunk_history(created_at DESC);

-- Add content_hash column to summer_chunks if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_chunks' AND column_name = 'content_hash'
  ) THEN
    ALTER TABLE summer_chunks ADD COLUMN content_hash VARCHAR(64);
  END IF;
END $$;

-- Add content_hash column to summer_documents if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_documents' AND column_name = 'content_hash'
  ) THEN
    ALTER TABLE summer_documents ADD COLUMN content_hash VARCHAR(64);
  END IF;
END $$;

-- RLS Policies
ALTER TABLE summer_extracted_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_extracted_equations ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_document_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_chunk_history ENABLE ROW LEVEL SECURITY;

-- Tables RLS
CREATE POLICY "Users can view their extracted tables"
  ON summer_extracted_tables FOR SELECT
  USING (
    collection_id IN (
      SELECT id FROM summer_collections WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage their extracted tables"
  ON summer_extracted_tables FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM summer_collections WHERE user_id = auth.uid()::text
    )
  );

-- Equations RLS
CREATE POLICY "Users can view their extracted equations"
  ON summer_extracted_equations FOR SELECT
  USING (
    collection_id IN (
      SELECT id FROM summer_collections WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage their extracted equations"
  ON summer_extracted_equations FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM summer_collections WHERE user_id = auth.uid()::text
    )
  );

-- Layouts RLS
CREATE POLICY "Users can view their document layouts"
  ON summer_document_layouts FOR SELECT
  USING (
    collection_id IN (
      SELECT id FROM summer_collections WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage their document layouts"
  ON summer_document_layouts FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM summer_collections WHERE user_id = auth.uid()::text
    )
  );

-- Chunk history RLS
CREATE POLICY "Users can view their chunk history"
  ON summer_chunk_history FOR SELECT
  USING (
    collection_id IN (
      SELECT id FROM summer_collections WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage their chunk history"
  ON summer_chunk_history FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM summer_collections WHERE user_id = auth.uid()::text
    )
  );

-- Function to record chunk change
CREATE OR REPLACE FUNCTION record_chunk_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.content_hash IS DISTINCT FROM NEW.content_hash THEN
    INSERT INTO summer_chunk_history (
      chunk_id,
      document_id,
      collection_id,
      change_type,
      old_content_hash,
      new_content_hash,
      old_content
    ) VALUES (
      NEW.id,
      NEW.document_id,
      NEW.collection_id,
      'modified',
      OLD.content_hash,
      NEW.content_hash,
      OLD.content
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO summer_chunk_history (
      chunk_id,
      document_id,
      collection_id,
      change_type,
      new_content_hash
    ) VALUES (
      NEW.id,
      NEW.document_id,
      NEW.collection_id,
      'added',
      NEW.content_hash
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for chunk changes (only if hash column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'summer_chunks' AND column_name = 'content_hash'
  ) THEN
    DROP TRIGGER IF EXISTS summer_chunk_change_trigger ON summer_chunks;
    CREATE TRIGGER summer_chunk_change_trigger
      AFTER INSERT OR UPDATE ON summer_chunks
      FOR EACH ROW
      EXECUTE FUNCTION record_chunk_change();
  END IF;
END $$;

COMMENT ON TABLE summer_extracted_tables IS 'Extracted tables from documents with structure and markdown';
COMMENT ON TABLE summer_extracted_equations IS 'Extracted math equations with LaTeX normalization';
COMMENT ON TABLE summer_document_layouts IS 'Document layout analysis results';
COMMENT ON TABLE summer_chunk_history IS 'History of chunk changes for partial updates';
