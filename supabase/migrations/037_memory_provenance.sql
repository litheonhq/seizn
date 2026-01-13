-- Migration: Memory Provenance
-- Tracks the source and origin of each memory for transparency and debugging
-- Part of Memory OS - Provenance tracking system

-- ===========================================
-- 1. Memory Provenance Table
-- ===========================================

CREATE TABLE IF NOT EXISTS memory_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,

  -- Source identification
  source_type TEXT NOT NULL CHECK (source_type IN (
    'conversation',  -- From chat/dialogue
    'document',      -- From uploaded document
    'image',         -- From image analysis
    'api',           -- From external API call
    'system'         -- System-generated (decay, merge, etc.)
  )),
  source_id TEXT,                    -- conversation_id, document_chunk_id, etc.
  source_metadata JSONB DEFAULT '{}', -- Additional context (e.g., page number, timestamp, model used)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 2. Indexes
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_memory_provenance_memory_id
  ON memory_provenance(memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_provenance_source_type
  ON memory_provenance(source_type);

CREATE INDEX IF NOT EXISTS idx_memory_provenance_source_id
  ON memory_provenance(source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_provenance_created_at
  ON memory_provenance(created_at DESC);

-- ===========================================
-- 3. Row Level Security
-- ===========================================

ALTER TABLE memory_provenance ENABLE ROW LEVEL SECURITY;

-- Users can view provenance for their own memories
CREATE POLICY "Users can view provenance for own memories"
  ON memory_provenance FOR SELECT
  USING (
    memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can insert provenance for their own memories
CREATE POLICY "Users can insert provenance for own memories"
  ON memory_provenance FOR INSERT
  WITH CHECK (
    memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can update provenance for their own memories
CREATE POLICY "Users can update provenance for own memories"
  ON memory_provenance FOR UPDATE
  USING (
    memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Users can delete provenance for their own memories
CREATE POLICY "Users can delete provenance for own memories"
  ON memory_provenance FOR DELETE
  USING (
    memory_id IN (
      SELECT id FROM memories WHERE user_id = auth.uid()
    )
  );

-- Service role bypass for system operations
CREATE POLICY "Service role has full access to provenance"
  ON memory_provenance FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ===========================================
-- 4. Helper Functions
-- ===========================================

-- Function to get full provenance chain for a memory
CREATE OR REPLACE FUNCTION get_memory_provenance(p_memory_id UUID)
RETURNS TABLE (
  provenance_id UUID,
  source_type TEXT,
  source_id TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mp.id,
    mp.source_type,
    mp.source_id,
    mp.source_metadata,
    mp.created_at
  FROM memory_provenance mp
  WHERE mp.memory_id = p_memory_id
  ORDER BY mp.created_at ASC;
END;
$$;

-- ===========================================
-- 5. Comments
-- ===========================================

COMMENT ON TABLE memory_provenance IS 'Tracks the source and origin of each memory for transparency, debugging, and audit purposes';
COMMENT ON COLUMN memory_provenance.source_type IS 'Type of source: conversation, document, image, api, or system';
COMMENT ON COLUMN memory_provenance.source_id IS 'Identifier of the source (e.g., conversation_id, document_chunk_id)';
COMMENT ON COLUMN memory_provenance.source_metadata IS 'Additional context like page number, timestamp, model used, extraction confidence';
