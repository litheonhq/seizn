-- ============================================
-- Graph Memory (GraphRAG)
-- Tier-S Feature 3: Knowledge Graph
-- ============================================

-- Knowledge graphs table
CREATE TABLE IF NOT EXISTS knowledge_graphs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization scope
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Graph metadata
    name TEXT NOT NULL,
    description TEXT,

    -- Statistics (denormalized for performance)
    entity_count INTEGER DEFAULT 0,
    relationship_count INTEGER DEFAULT 0,

    -- Configuration
    config JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Unique name per org
    CONSTRAINT unique_graph_name_per_org UNIQUE (organization_id, name)
);

-- Index for knowledge_graphs
CREATE INDEX IF NOT EXISTS idx_knowledge_graphs_org
    ON knowledge_graphs(organization_id);

-- Graph entities table
CREATE TABLE IF NOT EXISTS graph_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent graph
    graph_id UUID NOT NULL REFERENCES knowledge_graphs(id) ON DELETE CASCADE,

    -- Entity info
    type TEXT NOT NULL CHECK (type IN (
        'person', 'organization', 'location', 'concept',
        'event', 'product', 'technology', 'document', 'custom'
    )),
    name TEXT NOT NULL,
    description TEXT,
    aliases TEXT[] DEFAULT '{}',
    properties JSONB DEFAULT '{}',

    -- Vector embedding for semantic search
    embedding vector(1024),

    -- Source tracking
    source_documents TEXT[] DEFAULT '{}',

    -- Confidence and quality
    confidence NUMERIC(3,2) DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for graph_entities
CREATE INDEX IF NOT EXISTS idx_graph_entities_graph
    ON graph_entities(graph_id);

CREATE INDEX IF NOT EXISTS idx_graph_entities_type
    ON graph_entities(graph_id, type);

CREATE INDEX IF NOT EXISTS idx_graph_entities_name
    ON graph_entities(graph_id, name);

-- GIN index for aliases search
CREATE INDEX IF NOT EXISTS idx_graph_entities_aliases
    ON graph_entities USING GIN (aliases);

-- Vector index for semantic search (use HNSW instead of ivfflat for empty tables)
CREATE INDEX IF NOT EXISTS idx_graph_entities_embedding
    ON graph_entities USING hnsw (embedding vector_cosine_ops);

-- Graph relationships table
CREATE TABLE IF NOT EXISTS graph_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent graph
    graph_id UUID NOT NULL REFERENCES knowledge_graphs(id) ON DELETE CASCADE,

    -- Source and target entities
    source_entity_id UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,

    -- Relationship info
    type TEXT NOT NULL CHECK (type IN (
        'related_to', 'part_of', 'created_by', 'located_in',
        'works_for', 'owns', 'uses', 'mentions',
        'causes', 'precedes', 'follows', 'similar_to', 'custom'
    )),
    label TEXT,
    properties JSONB DEFAULT '{}',

    -- Weight and confidence
    weight NUMERIC(4,2) DEFAULT 1.0 CHECK (weight >= 0),
    confidence NUMERIC(3,2) DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),

    -- Source tracking
    source_document TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Prevent duplicate relationships
    CONSTRAINT unique_relationship UNIQUE (graph_id, source_entity_id, target_entity_id, type)
);

-- Indexes for graph_relationships
CREATE INDEX IF NOT EXISTS idx_graph_relationships_graph
    ON graph_relationships(graph_id);

CREATE INDEX IF NOT EXISTS idx_graph_relationships_source
    ON graph_relationships(source_entity_id);

CREATE INDEX IF NOT EXISTS idx_graph_relationships_target
    ON graph_relationships(target_entity_id);

CREATE INDEX IF NOT EXISTS idx_graph_relationships_type
    ON graph_relationships(graph_id, type);

-- Entity extraction history
CREATE TABLE IF NOT EXISTS graph_extraction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent graph
    graph_id UUID NOT NULL REFERENCES knowledge_graphs(id) ON DELETE CASCADE,

    -- Source document
    document_id TEXT NOT NULL,
    document_content_hash TEXT,

    -- Extraction results
    entities_extracted INTEGER DEFAULT 0,
    relationships_extracted INTEGER DEFAULT 0,
    processing_time_ms INTEGER,

    -- Status
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed'
    )),
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for extraction history
CREATE INDEX IF NOT EXISTS idx_graph_extraction_graph
    ON graph_extraction_history(graph_id, created_at DESC);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE knowledge_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_extraction_history ENABLE ROW LEVEL SECURITY;

-- knowledge_graphs policies
CREATE POLICY "org_read_knowledge_graphs" ON knowledge_graphs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_manage_knowledge_graphs" ON knowledge_graphs
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin', 'developer')
        )
    );

CREATE POLICY "service_all_knowledge_graphs" ON knowledge_graphs
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- graph_entities policies (inherit from graph)
CREATE POLICY "org_read_graph_entities" ON graph_entities
    FOR SELECT USING (
        graph_id IN (
            SELECT id FROM knowledge_graphs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "org_manage_graph_entities" ON graph_entities
    FOR ALL USING (
        graph_id IN (
            SELECT id FROM knowledge_graphs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
                AND role IN ('owner', 'admin', 'developer')
            )
        )
    );

CREATE POLICY "service_all_graph_entities" ON graph_entities
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- graph_relationships policies (inherit from graph)
CREATE POLICY "org_read_graph_relationships" ON graph_relationships
    FOR SELECT USING (
        graph_id IN (
            SELECT id FROM knowledge_graphs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "org_manage_graph_relationships" ON graph_relationships
    FOR ALL USING (
        graph_id IN (
            SELECT id FROM knowledge_graphs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
                AND role IN ('owner', 'admin', 'developer')
            )
        )
    );

CREATE POLICY "service_all_graph_relationships" ON graph_relationships
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- graph_extraction_history policies
CREATE POLICY "org_read_extraction_history" ON graph_extraction_history
    FOR SELECT USING (
        graph_id IN (
            SELECT id FROM knowledge_graphs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "service_all_extraction_history" ON graph_extraction_history
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to increment entity count
CREATE OR REPLACE FUNCTION increment_graph_entity_count(
    p_graph_id UUID,
    p_count INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    UPDATE knowledge_graphs
    SET entity_count = entity_count + p_count,
        updated_at = NOW()
    WHERE id = p_graph_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment relationship count
CREATE OR REPLACE FUNCTION increment_graph_relationship_count(
    p_graph_id UUID,
    p_count INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    UPDATE knowledge_graphs
    SET relationship_count = relationship_count + p_count,
        updated_at = NOW()
    WHERE id = p_graph_id;
END;
$$ LANGUAGE plpgsql;

-- Function to search entities by embedding
CREATE OR REPLACE FUNCTION search_graph_entities_by_embedding(
    p_graph_id UUID,
    p_embedding vector(1024),
    p_limit INTEGER DEFAULT 10,
    p_min_similarity NUMERIC DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    type TEXT,
    description TEXT,
    similarity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.name,
        e.type,
        e.description,
        1 - (e.embedding <=> p_embedding) AS similarity
    FROM graph_entities e
    WHERE e.graph_id = p_graph_id
        AND e.embedding IS NOT NULL
        AND 1 - (e.embedding <=> p_embedding) >= p_min_similarity
    ORDER BY e.embedding <=> p_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get entity with relationships
CREATE OR REPLACE FUNCTION get_entity_with_relationships(p_entity_id UUID)
RETURNS TABLE (
    entity JSONB,
    outgoing_relationships JSONB,
    incoming_relationships JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        to_jsonb(e.*) AS entity,
        COALESCE((
            SELECT jsonb_agg(to_jsonb(r.*) || jsonb_build_object(
                'target_entity', to_jsonb(te.*)
            ))
            FROM graph_relationships r
            JOIN graph_entities te ON r.target_entity_id = te.id
            WHERE r.source_entity_id = p_entity_id
        ), '[]'::JSONB) AS outgoing_relationships,
        COALESCE((
            SELECT jsonb_agg(to_jsonb(r.*) || jsonb_build_object(
                'source_entity', to_jsonb(se.*)
            ))
            FROM graph_relationships r
            JOIN graph_entities se ON r.source_entity_id = se.id
            WHERE r.target_entity_id = p_entity_id
        ), '[]'::JSONB) AS incoming_relationships
    FROM graph_entities e
    WHERE e.id = p_entity_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get graph statistics
CREATE OR REPLACE FUNCTION get_graph_statistics(p_graph_id UUID)
RETURNS TABLE (
    entity_count BIGINT,
    relationship_count BIGINT,
    entity_types JSONB,
    relationship_types JSONB,
    avg_confidence NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM graph_entities WHERE graph_id = p_graph_id) AS entity_count,
        (SELECT COUNT(*) FROM graph_relationships WHERE graph_id = p_graph_id) AS relationship_count,
        (
            SELECT jsonb_object_agg(type, cnt)
            FROM (
                SELECT type, COUNT(*) as cnt
                FROM graph_entities
                WHERE graph_id = p_graph_id
                GROUP BY type
            ) type_counts
        ) AS entity_types,
        (
            SELECT jsonb_object_agg(type, cnt)
            FROM (
                SELECT type, COUNT(*) as cnt
                FROM graph_relationships
                WHERE graph_id = p_graph_id
                GROUP BY type
            ) type_counts
        ) AS relationship_types,
        (SELECT AVG(confidence) FROM graph_entities WHERE graph_id = p_graph_id) AS avg_confidence;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_knowledge_graph_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER knowledge_graphs_updated_at
    BEFORE UPDATE ON knowledge_graphs
    FOR EACH ROW
    EXECUTE FUNCTION update_knowledge_graph_timestamp();

CREATE TRIGGER graph_entities_updated_at
    BEFORE UPDATE ON graph_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_knowledge_graph_timestamp();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE knowledge_graphs IS 'Knowledge graphs for GraphRAG retrieval';
COMMENT ON TABLE graph_entities IS 'Entities extracted from documents for graph memory';
COMMENT ON TABLE graph_relationships IS 'Relationships between graph entities';
COMMENT ON TABLE graph_extraction_history IS 'History of entity extraction runs';

COMMENT ON COLUMN graph_entities.embedding IS 'Vector embedding for semantic entity search';
COMMENT ON COLUMN graph_entities.aliases IS 'Alternative names for the entity';
COMMENT ON COLUMN graph_relationships.weight IS 'Relationship strength weight';

COMMENT ON FUNCTION search_graph_entities_by_embedding IS 'Search entities by vector similarity';
COMMENT ON FUNCTION get_entity_with_relationships IS 'Get entity with all connected relationships';
COMMENT ON FUNCTION get_graph_statistics IS 'Get graph statistics and type distributions';
