-- Migration: 069_graph_rag.sql
-- Phase C1: GraphRAG - Knowledge Graph for Entity-Aware Retrieval
-- Enables entity extraction, relationship mapping, and graph-based querying

-- ============================================
-- 0. Prerequisites - Ensure pgvector is enabled
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. Graph Entities Table
-- ============================================

CREATE TABLE IF NOT EXISTS graph_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID, -- Optional: link to summer_collections

  -- Entity identification
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}', -- Alternative names/spellings

  -- Entity classification
  type TEXT NOT NULL CHECK (type IN (
    'person',       -- People, authors, researchers
    'organization', -- Companies, institutions, agencies
    'location',     -- Geographic places
    'concept',      -- Abstract ideas, theories
    'technology',   -- Tech stack, tools, frameworks
    'method',       -- Methodologies, processes
    'event',        -- Conferences, incidents, milestones
    'product',      -- Software, hardware, services
    'document',     -- Papers, reports, articles
    'date',         -- Temporal markers
    'metric',       -- KPIs, measurements
    'custom'        -- User-defined types
  )),

  -- Semantic representation
  description TEXT,
  embedding VECTOR(1024), -- For semantic similarity

  -- Provenance
  confidence DECIMAL(3, 2) DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  source_chunks TEXT[] DEFAULT '{}', -- Chunk IDs where entity was found
  extraction_model TEXT DEFAULT 'gpt-4o-mini', -- Model used for extraction

  -- Metadata
  metadata JSONB DEFAULT '{}', -- Flexible storage for type-specific data

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Graph Relations Table
-- ============================================

CREATE TABLE IF NOT EXISTS graph_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID,

  -- Relationship endpoints
  source_entity_id UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,

  -- Relationship classification
  type TEXT NOT NULL CHECK (type IN (
    -- Hierarchical
    'is_a',           -- Subtype/instance relationship
    'part_of',        -- Composition
    'belongs_to',     -- Membership
    'contains',       -- Inverse of part_of

    -- Causal
    'causes',         -- Cause-effect
    'prevents',       -- Prevention
    'enables',        -- Enablement

    -- Dependencies
    'requires',       -- Prerequisite
    'depends_on',     -- Dependency
    'uses',           -- Usage
    'implements',     -- Implementation

    -- Associations
    'related_to',     -- Generic association
    'similar_to',     -- Similarity
    'contrasts_with', -- Opposition
    'references',     -- Citation

    -- Temporal
    'precedes',       -- Time ordering
    'follows',        -- Inverse time ordering
    'concurrent_with', -- Simultaneity

    -- Social/Org
    'works_for',      -- Employment
    'collaborates_with', -- Collaboration
    'authored_by',    -- Authorship

    -- Custom
    'custom'          -- User-defined
  )),

  -- Evidence
  evidence TEXT,           -- Text supporting the relationship
  evidence_chunk_id TEXT,  -- Chunk ID where relation was extracted

  -- Confidence
  confidence DECIMAL(3, 2) DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate relations
  CONSTRAINT unique_graph_relation UNIQUE (source_entity_id, target_entity_id, type)
);

-- ============================================
-- 3. Indexes
-- ============================================

-- Entity indexes
CREATE INDEX IF NOT EXISTS idx_graph_entities_user_id ON graph_entities(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_collection ON graph_entities(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON graph_entities(type);
CREATE INDEX IF NOT EXISTS idx_graph_entities_name ON graph_entities(name);
CREATE INDEX IF NOT EXISTS idx_graph_entities_name_lower ON graph_entities(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_graph_entities_confidence ON graph_entities(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_graph_entities_created_at ON graph_entities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_entities_aliases ON graph_entities USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_graph_entities_source_chunks ON graph_entities USING GIN(source_chunks);
CREATE INDEX IF NOT EXISTS idx_graph_entities_metadata ON graph_entities USING GIN(metadata);

-- Entity vector index (HNSW for fast ANN search)
CREATE INDEX IF NOT EXISTS idx_graph_entities_embedding ON graph_entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Relation indexes
CREATE INDEX IF NOT EXISTS idx_graph_relations_user_id ON graph_relations(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_relations_collection ON graph_relations(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_relations_source ON graph_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_relations_target ON graph_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_relations_type ON graph_relations(type);
CREATE INDEX IF NOT EXISTS idx_graph_relations_confidence ON graph_relations(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_graph_relations_source_type ON graph_relations(source_entity_id, type);
CREATE INDEX IF NOT EXISTS idx_graph_relations_target_type ON graph_relations(target_entity_id, type);
CREATE INDEX IF NOT EXISTS idx_graph_relations_created_at ON graph_relations(created_at DESC);

-- ============================================
-- 4. Row Level Security
-- ============================================

ALTER TABLE graph_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_relations ENABLE ROW LEVEL SECURITY;

-- Entity policies
CREATE POLICY "Users can view own entities"
  ON graph_entities FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own entities"
  ON graph_entities FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entities"
  ON graph_entities FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own entities"
  ON graph_entities FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to entities"
  ON graph_entities FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- Relation policies
CREATE POLICY "Users can view own relations"
  ON graph_relations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own relations"
  ON graph_relations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own relations"
  ON graph_relations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own relations"
  ON graph_relations FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to relations"
  ON graph_relations FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role');

-- ============================================
-- 5. Updated_at Trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_graph_entities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS graph_entities_updated_at ON graph_entities;
CREATE TRIGGER graph_entities_updated_at
  BEFORE UPDATE ON graph_entities
  FOR EACH ROW
  EXECUTE FUNCTION update_graph_entities_updated_at();

-- ============================================
-- 6. RPC Functions
-- ============================================

-- Vector similarity search for entities
CREATE OR REPLACE FUNCTION match_graph_entities(
  query_embedding VECTOR(1024),
  match_user_id UUID,
  match_collection_id UUID DEFAULT NULL,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  filter_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  aliases TEXT[],
  type TEXT,
  description TEXT,
  confidence DECIMAL(3, 2),
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
    e.id,
    e.name,
    e.aliases,
    e.type,
    e.description,
    e.confidence,
    e.metadata,
    (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity,
    e.created_at
  FROM graph_entities e
  WHERE e.user_id = match_user_id
    AND e.embedding IS NOT NULL
    AND (match_collection_id IS NULL OR e.collection_id = match_collection_id)
    AND (filter_types IS NULL OR e.type = ANY(filter_types))
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Find entity by name (fuzzy match)
CREATE OR REPLACE FUNCTION find_entity_by_name(
  p_user_id UUID,
  p_name TEXT,
  p_collection_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  aliases TEXT[],
  type TEXT,
  confidence DECIMAL(3, 2),
  match_type TEXT -- 'exact', 'alias', 'fuzzy'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH matches AS (
    -- Exact name match
    SELECT
      e.id, e.name, e.aliases, e.type, e.confidence,
      'exact'::TEXT AS match_type,
      1 AS priority
    FROM graph_entities e
    WHERE e.user_id = p_user_id
      AND (p_collection_id IS NULL OR e.collection_id = p_collection_id)
      AND LOWER(e.name) = LOWER(p_name)

    UNION ALL

    -- Alias match
    SELECT
      e.id, e.name, e.aliases, e.type, e.confidence,
      'alias'::TEXT AS match_type,
      2 AS priority
    FROM graph_entities e
    WHERE e.user_id = p_user_id
      AND (p_collection_id IS NULL OR e.collection_id = p_collection_id)
      AND LOWER(p_name) = ANY(SELECT LOWER(unnest(e.aliases)))

    UNION ALL

    -- Fuzzy match (trigram similarity would need pg_trgm extension)
    SELECT
      e.id, e.name, e.aliases, e.type, e.confidence,
      'fuzzy'::TEXT AS match_type,
      3 AS priority
    FROM graph_entities e
    WHERE e.user_id = p_user_id
      AND (p_collection_id IS NULL OR e.collection_id = p_collection_id)
      AND (
        LOWER(e.name) LIKE '%' || LOWER(p_name) || '%'
        OR LOWER(p_name) LIKE '%' || LOWER(e.name) || '%'
      )
  )
  SELECT DISTINCT ON (m.id)
    m.id, m.name, m.aliases, m.type, m.confidence, m.match_type
  FROM matches m
  ORDER BY m.id, m.priority
  LIMIT p_limit;
END;
$$;

-- Get entity with all relations
CREATE OR REPLACE FUNCTION get_entity_with_relations(
  p_entity_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  entity JSONB,
  outgoing_relations JSONB,
  incoming_relations JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Entity data
    jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'aliases', e.aliases,
      'type', e.type,
      'description', e.description,
      'confidence', e.confidence,
      'metadata', e.metadata,
      'created_at', e.created_at
    ) AS entity,

    -- Outgoing relations
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'relation_id', r.id,
            'type', r.type,
            'target_id', r.target_entity_id,
            'target_name', te.name,
            'target_type', te.type,
            'confidence', r.confidence,
            'evidence', r.evidence
          )
        )
        FROM graph_relations r
        JOIN graph_entities te ON r.target_entity_id = te.id
        WHERE r.source_entity_id = e.id
      ),
      '[]'::jsonb
    ) AS outgoing_relations,

    -- Incoming relations
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'relation_id', r.id,
            'type', r.type,
            'source_id', r.source_entity_id,
            'source_name', se.name,
            'source_type', se.type,
            'confidence', r.confidence,
            'evidence', r.evidence
          )
        )
        FROM graph_relations r
        JOIN graph_entities se ON r.source_entity_id = se.id
        WHERE r.target_entity_id = e.id
      ),
      '[]'::jsonb
    ) AS incoming_relations

  FROM graph_entities e
  WHERE e.id = p_entity_id
    AND e.user_id = p_user_id;
END;
$$;

-- Find related entities (multi-hop traversal)
CREATE OR REPLACE FUNCTION find_related_entities(
  p_entity_id UUID,
  p_user_id UUID,
  p_max_hops INT DEFAULT 2,
  p_relation_types TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  entity_id UUID,
  entity_name TEXT,
  entity_type TEXT,
  path_length INT,
  relation_path TEXT[],
  total_confidence FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE entity_graph AS (
    -- Base case: starting entity
    SELECT
      e.id AS entity_id,
      e.name AS entity_name,
      e.type AS entity_type,
      0 AS path_length,
      ARRAY[]::TEXT[] AS relation_path,
      1.0::FLOAT AS total_confidence,
      ARRAY[e.id] AS visited
    FROM graph_entities e
    WHERE e.id = p_entity_id
      AND e.user_id = p_user_id

    UNION ALL

    -- Recursive: traverse relations
    SELECT
      te.id AS entity_id,
      te.name AS entity_name,
      te.type AS entity_type,
      eg.path_length + 1 AS path_length,
      eg.relation_path || r.type AS relation_path,
      (eg.total_confidence * r.confidence)::FLOAT AS total_confidence,
      eg.visited || te.id AS visited
    FROM entity_graph eg
    JOIN graph_relations r ON (
      r.source_entity_id = eg.entity_id
      OR r.target_entity_id = eg.entity_id
    )
    JOIN graph_entities te ON (
      CASE
        WHEN r.source_entity_id = eg.entity_id THEN r.target_entity_id
        ELSE r.source_entity_id
      END = te.id
    )
    WHERE eg.path_length < p_max_hops
      AND te.user_id = p_user_id
      AND NOT te.id = ANY(eg.visited) -- Prevent cycles
      AND (p_relation_types IS NULL OR r.type = ANY(p_relation_types))
  )
  SELECT DISTINCT ON (eg.entity_id)
    eg.entity_id,
    eg.entity_name,
    eg.entity_type,
    eg.path_length,
    eg.relation_path,
    eg.total_confidence
  FROM entity_graph eg
  WHERE eg.path_length > 0 -- Exclude starting entity
  ORDER BY eg.entity_id, eg.total_confidence DESC
  LIMIT p_limit;
END;
$$;

-- Upsert entity (create or update)
CREATE OR REPLACE FUNCTION upsert_graph_entity(
  p_user_id UUID,
  p_name TEXT,
  p_type TEXT,
  p_collection_id UUID DEFAULT NULL,
  p_aliases TEXT[] DEFAULT '{}',
  p_description TEXT DEFAULT NULL,
  p_embedding VECTOR(1024) DEFAULT NULL,
  p_confidence DECIMAL(3, 2) DEFAULT 0.50,
  p_source_chunks TEXT[] DEFAULT '{}',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entity_id UUID;
BEGIN
  -- Try to find existing entity
  SELECT id INTO v_entity_id
  FROM graph_entities
  WHERE user_id = p_user_id
    AND LOWER(name) = LOWER(p_name)
    AND type = p_type
    AND (p_collection_id IS NULL OR collection_id = p_collection_id)
  LIMIT 1;

  IF v_entity_id IS NOT NULL THEN
    -- Update existing entity
    UPDATE graph_entities
    SET
      aliases = ARRAY(SELECT DISTINCT unnest(aliases || p_aliases)),
      description = COALESCE(p_description, description),
      embedding = COALESCE(p_embedding, embedding),
      confidence = GREATEST(confidence, p_confidence),
      source_chunks = ARRAY(SELECT DISTINCT unnest(source_chunks || p_source_chunks)),
      metadata = metadata || p_metadata,
      updated_at = NOW()
    WHERE id = v_entity_id;
  ELSE
    -- Insert new entity
    INSERT INTO graph_entities (
      user_id, collection_id, name, aliases, type,
      description, embedding, confidence, source_chunks, metadata
    ) VALUES (
      p_user_id, p_collection_id, p_name, p_aliases, p_type,
      p_description, p_embedding, p_confidence, p_source_chunks, p_metadata
    )
    RETURNING id INTO v_entity_id;
  END IF;

  RETURN v_entity_id;
END;
$$;

-- Upsert relation
CREATE OR REPLACE FUNCTION upsert_graph_relation(
  p_user_id UUID,
  p_source_entity_id UUID,
  p_target_entity_id UUID,
  p_type TEXT,
  p_collection_id UUID DEFAULT NULL,
  p_evidence TEXT DEFAULT NULL,
  p_evidence_chunk_id TEXT DEFAULT NULL,
  p_confidence DECIMAL(3, 2) DEFAULT 0.50,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_relation_id UUID;
BEGIN
  INSERT INTO graph_relations (
    user_id, collection_id, source_entity_id, target_entity_id,
    type, evidence, evidence_chunk_id, confidence, metadata
  ) VALUES (
    p_user_id, p_collection_id, p_source_entity_id, p_target_entity_id,
    p_type, p_evidence, p_evidence_chunk_id, p_confidence, p_metadata
  )
  ON CONFLICT (source_entity_id, target_entity_id, type)
  DO UPDATE SET
    evidence = COALESCE(EXCLUDED.evidence, graph_relations.evidence),
    confidence = GREATEST(graph_relations.confidence, EXCLUDED.confidence),
    metadata = graph_relations.metadata || EXCLUDED.metadata
  RETURNING id INTO v_relation_id;

  RETURN v_relation_id;
END;
$$;

-- Get graph statistics
CREATE OR REPLACE FUNCTION get_graph_stats(
  p_user_id UUID,
  p_collection_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_entities BIGINT,
  total_relations BIGINT,
  entities_by_type JSONB,
  relations_by_type JSONB,
  avg_entity_confidence FLOAT,
  avg_relation_confidence FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM graph_entities e
     WHERE e.user_id = p_user_id
     AND (p_collection_id IS NULL OR e.collection_id = p_collection_id))::BIGINT AS total_entities,

    (SELECT COUNT(*) FROM graph_relations r
     WHERE r.user_id = p_user_id
     AND (p_collection_id IS NULL OR r.collection_id = p_collection_id))::BIGINT AS total_relations,

    (SELECT COALESCE(jsonb_object_agg(type, cnt), '{}'::jsonb)
     FROM (SELECT type, COUNT(*) AS cnt FROM graph_entities
           WHERE user_id = p_user_id
           AND (p_collection_id IS NULL OR collection_id = p_collection_id)
           GROUP BY type) sub) AS entities_by_type,

    (SELECT COALESCE(jsonb_object_agg(type, cnt), '{}'::jsonb)
     FROM (SELECT type, COUNT(*) AS cnt FROM graph_relations
           WHERE user_id = p_user_id
           AND (p_collection_id IS NULL OR collection_id = p_collection_id)
           GROUP BY type) sub) AS relations_by_type,

    (SELECT COALESCE(AVG(confidence), 0)::FLOAT FROM graph_entities
     WHERE user_id = p_user_id
     AND (p_collection_id IS NULL OR collection_id = p_collection_id)) AS avg_entity_confidence,

    (SELECT COALESCE(AVG(confidence), 0)::FLOAT FROM graph_relations
     WHERE user_id = p_user_id
     AND (p_collection_id IS NULL OR collection_id = p_collection_id)) AS avg_relation_confidence;
END;
$$;

-- ============================================
-- 7. Comments
-- ============================================

COMMENT ON TABLE graph_entities IS 'Phase C1: GraphRAG entities - Named entities extracted from documents for knowledge graph construction';
COMMENT ON COLUMN graph_entities.name IS 'Primary name of the entity';
COMMENT ON COLUMN graph_entities.aliases IS 'Alternative names, abbreviations, or spellings';
COMMENT ON COLUMN graph_entities.type IS 'Entity classification: person, organization, concept, etc.';
COMMENT ON COLUMN graph_entities.embedding IS 'Vector representation for semantic similarity search';
COMMENT ON COLUMN graph_entities.confidence IS 'Extraction confidence score (0-1)';
COMMENT ON COLUMN graph_entities.source_chunks IS 'Chunk IDs where this entity was extracted from';

COMMENT ON TABLE graph_relations IS 'Phase C1: GraphRAG relations - Relationships between entities';
COMMENT ON COLUMN graph_relations.type IS 'Relationship type: is_a, part_of, causes, requires, etc.';
COMMENT ON COLUMN graph_relations.evidence IS 'Text snippet supporting this relationship';
COMMENT ON COLUMN graph_relations.evidence_chunk_id IS 'Chunk ID where this relation was extracted';

COMMENT ON FUNCTION match_graph_entities IS 'Vector similarity search for entities';
COMMENT ON FUNCTION find_entity_by_name IS 'Find entity by exact name, alias, or fuzzy match';
COMMENT ON FUNCTION get_entity_with_relations IS 'Get entity details with all incoming/outgoing relations';
COMMENT ON FUNCTION find_related_entities IS 'Multi-hop graph traversal to find related entities';
COMMENT ON FUNCTION upsert_graph_entity IS 'Create or update entity with merge semantics';
COMMENT ON FUNCTION upsert_graph_relation IS 'Create or update relation with merge semantics';
COMMENT ON FUNCTION get_graph_stats IS 'Get knowledge graph statistics for a user';
