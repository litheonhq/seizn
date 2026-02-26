-- ============================================
-- Evidence Packs: W3C PROV-compliant Provenance
-- Tier-S Feature 2: Verifiable Evidence
-- ============================================

-- Evidence packs table - stores W3C PROV bundles
CREATE TABLE IF NOT EXISTS evidence_packs (
    id TEXT PRIMARY KEY,

    -- Version info
    version TEXT NOT NULL DEFAULT '1.0',

    -- Organization scope
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Trace linkage
    trace_id TEXT,
    purpose TEXT,

    -- W3C PROV document (JSON-LD)
    provenance JSONB NOT NULL,

    -- Digital signature (optional)
    signature JSONB,

    -- Integrity hash
    hash TEXT NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    verified_at TIMESTAMPTZ,

    -- Verification status
    verification_status TEXT DEFAULT 'unverified' CHECK (verification_status IN (
        'unverified', 'valid', 'invalid', 'expired'
    )),
    verification_errors JSONB DEFAULT '[]'
);

-- Indexes for evidence_packs
CREATE INDEX IF NOT EXISTS idx_evidence_packs_org
    ON evidence_packs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_packs_trace
    ON evidence_packs(trace_id) WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_packs_hash
    ON evidence_packs(hash);

-- GIN index for provenance queries
CREATE INDEX IF NOT EXISTS idx_evidence_packs_provenance
    ON evidence_packs USING GIN (provenance jsonb_path_ops);

-- ============================================
-- Evidence Pack Entities (denormalized for queries)
-- ============================================

CREATE TABLE IF NOT EXISTS evidence_pack_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent pack
    pack_id TEXT NOT NULL REFERENCES evidence_packs(id) ON DELETE CASCADE,

    -- Entity info
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- 'Entity', 'Activity', 'Agent'
    label TEXT,

    -- Entity value (for searchable content)
    value_text TEXT,
    value_json JSONB,

    -- Timestamps from PROV
    generated_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,

    -- Attributes
    attributes JSONB DEFAULT '{}',

    CONSTRAINT unique_pack_entity UNIQUE (pack_id, entity_id)
);

-- Indexes for entity queries
CREATE INDEX IF NOT EXISTS idx_evidence_entities_pack
    ON evidence_pack_entities(pack_id);

CREATE INDEX IF NOT EXISTS idx_evidence_entities_type
    ON evidence_pack_entities(entity_type);

CREATE INDEX IF NOT EXISTS idx_evidence_entities_label
    ON evidence_pack_entities(label) WHERE label IS NOT NULL;

-- Full-text search on entity values
CREATE INDEX IF NOT EXISTS idx_evidence_entities_value_fts
    ON evidence_pack_entities USING GIN (to_tsvector('english', COALESCE(value_text, '')));

-- ============================================
-- Evidence Pack Relations (denormalized)
-- ============================================

CREATE TABLE IF NOT EXISTS evidence_pack_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent pack
    pack_id TEXT NOT NULL REFERENCES evidence_packs(id) ON DELETE CASCADE,

    -- Relation info
    relation_type TEXT NOT NULL CHECK (relation_type IN (
        'wasGeneratedBy', 'used', 'wasDerivedFrom',
        'wasAttributedTo', 'wasAssociatedWith',
        'actedOnBehalfOf', 'wasInformedBy'
    )),

    -- Source and target
    subject_id TEXT NOT NULL,
    object_id TEXT NOT NULL,

    -- Optional attributes
    role TEXT,
    time TIMESTAMPTZ,
    attributes JSONB DEFAULT '{}'
);

-- Indexes for relation queries
CREATE INDEX IF NOT EXISTS idx_evidence_relations_pack
    ON evidence_pack_relations(pack_id);

CREATE INDEX IF NOT EXISTS idx_evidence_relations_type
    ON evidence_pack_relations(relation_type);

CREATE INDEX IF NOT EXISTS idx_evidence_relations_subject
    ON evidence_pack_relations(subject_id);

CREATE INDEX IF NOT EXISTS idx_evidence_relations_object
    ON evidence_pack_relations(object_id);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE evidence_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_pack_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_pack_relations ENABLE ROW LEVEL SECURITY;

-- evidence_packs policies
CREATE POLICY "org_read_evidence_packs" ON evidence_packs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_insert_evidence_packs" ON evidence_packs
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "service_all_evidence_packs" ON evidence_packs
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- evidence_pack_entities policies (inherit from pack)
CREATE POLICY "org_read_evidence_entities" ON evidence_pack_entities
    FOR SELECT USING (
        pack_id IN (
            SELECT id FROM evidence_packs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "service_all_evidence_entities" ON evidence_pack_entities
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- evidence_pack_relations policies (inherit from pack)
CREATE POLICY "org_read_evidence_relations" ON evidence_pack_relations
    FOR SELECT USING (
        pack_id IN (
            SELECT id FROM evidence_packs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "service_all_evidence_relations" ON evidence_pack_relations
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get derivation chain for an entity
CREATE OR REPLACE FUNCTION get_derivation_chain(
    p_pack_id TEXT,
    p_entity_id TEXT,
    p_max_depth INTEGER DEFAULT 10
)
RETURNS TABLE (
    depth INTEGER,
    entity_id TEXT,
    derived_from TEXT,
    derivation_type TEXT
) AS $$
WITH RECURSIVE chain AS (
    -- Base case
    SELECT
        0 AS depth,
        p_entity_id AS entity_id,
        NULL::TEXT AS derived_from,
        NULL::TEXT AS derivation_type

    UNION ALL

    -- Recursive case
    SELECT
        c.depth + 1,
        r.object_id AS entity_id,
        r.subject_id AS derived_from,
        r.attributes->>'type' AS derivation_type
    FROM chain c
    JOIN evidence_pack_relations r ON r.subject_id = c.entity_id
    WHERE r.pack_id = p_pack_id
        AND r.relation_type = 'wasDerivedFrom'
        AND c.depth < p_max_depth
)
SELECT * FROM chain;
$$ LANGUAGE sql;

-- Function to verify pack hash
CREATE OR REPLACE FUNCTION verify_evidence_pack_hash(p_pack_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    stored_hash TEXT;
    computed_hash TEXT;
    provenance_json TEXT;
BEGIN
    SELECT hash, provenance::TEXT
    INTO stored_hash, provenance_json
    FROM evidence_packs
    WHERE id = p_pack_id;

    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Compute hash (requires pgcrypto extension)
    computed_hash := encode(sha256(provenance_json::bytea), 'hex');

    RETURN stored_hash = computed_hash;
END;
$$ LANGUAGE plpgsql;

-- Function to index pack entities and relations
CREATE OR REPLACE FUNCTION index_evidence_pack()
RETURNS TRIGGER AS $$
DECLARE
    entity_key TEXT;
    entity_val JSONB;
    relation_key TEXT;
    relation_val JSONB;
BEGIN
    -- Index entities
    FOR entity_key, entity_val IN SELECT * FROM jsonb_each(NEW.provenance->'entity')
    LOOP
        INSERT INTO evidence_pack_entities (pack_id, entity_id, entity_type, label, value_json, attributes, generated_at)
        VALUES (
            NEW.id,
            entity_key,
            'Entity',
            entity_val->>'label',
            entity_val->'value',
            entity_val->'attributes',
            (entity_val->>'generatedAtTime')::TIMESTAMPTZ
        )
        ON CONFLICT (pack_id, entity_id) DO NOTHING;
    END LOOP;

    -- Index activities
    FOR entity_key, entity_val IN SELECT * FROM jsonb_each(NEW.provenance->'activity')
    LOOP
        INSERT INTO evidence_pack_entities (pack_id, entity_id, entity_type, label, attributes, generated_at)
        VALUES (
            NEW.id,
            entity_key,
            'Activity',
            entity_val->>'label',
            entity_val->'attributes',
            (entity_val->>'startedAtTime')::TIMESTAMPTZ
        )
        ON CONFLICT (pack_id, entity_id) DO NOTHING;
    END LOOP;

    -- Index agents
    FOR entity_key, entity_val IN SELECT * FROM jsonb_each(NEW.provenance->'agent')
    LOOP
        INSERT INTO evidence_pack_entities (pack_id, entity_id, entity_type, label, attributes)
        VALUES (
            NEW.id,
            entity_key,
            'Agent',
            entity_val->>'label',
            entity_val->'attributes'
        )
        ON CONFLICT (pack_id, entity_id) DO NOTHING;
    END LOOP;

    -- Index relations
    FOR relation_key, relation_val IN SELECT * FROM jsonb_each(NEW.provenance->'wasGeneratedBy')
    LOOP
        INSERT INTO evidence_pack_relations (pack_id, relation_type, subject_id, object_id, time)
        VALUES (NEW.id, 'wasGeneratedBy', relation_val->>'entity', relation_val->>'activity', (relation_val->>'time')::TIMESTAMPTZ);
    END LOOP;

    FOR relation_key, relation_val IN SELECT * FROM jsonb_each(NEW.provenance->'used')
    LOOP
        INSERT INTO evidence_pack_relations (pack_id, relation_type, subject_id, object_id, role)
        VALUES (NEW.id, 'used', relation_val->>'activity', relation_val->>'entity', relation_val->>'role');
    END LOOP;

    FOR relation_key, relation_val IN SELECT * FROM jsonb_each(NEW.provenance->'wasDerivedFrom')
    LOOP
        INSERT INTO evidence_pack_relations (pack_id, relation_type, subject_id, object_id, attributes)
        VALUES (NEW.id, 'wasDerivedFrom', relation_val->>'generatedEntity', relation_val->>'usedEntity', jsonb_build_object('type', relation_val->>'type'));
    END LOOP;

    FOR relation_key, relation_val IN SELECT * FROM jsonb_each(NEW.provenance->'wasAttributedTo')
    LOOP
        INSERT INTO evidence_pack_relations (pack_id, relation_type, subject_id, object_id)
        VALUES (NEW.id, 'wasAttributedTo', relation_val->>'entity', relation_val->>'agent');
    END LOOP;

    FOR relation_key, relation_val IN SELECT * FROM jsonb_each(NEW.provenance->'wasAssociatedWith')
    LOOP
        INSERT INTO evidence_pack_relations (pack_id, relation_type, subject_id, object_id, role)
        VALUES (NEW.id, 'wasAssociatedWith', relation_val->>'activity', relation_val->>'agent', relation_val->>'role');
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_pack_index_trigger
    AFTER INSERT ON evidence_packs
    FOR EACH ROW
    EXECUTE FUNCTION index_evidence_pack();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE evidence_packs IS 'W3C PROV-compliant evidence bundles for RAG provenance';
COMMENT ON TABLE evidence_pack_entities IS 'Denormalized PROV entities for efficient querying';
COMMENT ON TABLE evidence_pack_relations IS 'Denormalized PROV relations for graph traversal';

COMMENT ON COLUMN evidence_packs.provenance IS 'W3C PROV-JSON document';
COMMENT ON COLUMN evidence_packs.signature IS 'Digital signature for tamper-evidence';
COMMENT ON COLUMN evidence_packs.hash IS 'SHA-256 hash of provenance document';

COMMENT ON FUNCTION get_derivation_chain IS 'Trace the derivation chain for an entity';
COMMENT ON FUNCTION verify_evidence_pack_hash IS 'Verify integrity of evidence pack';
