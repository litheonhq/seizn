-- ===========================================
-- Intelligent Memory v3 Schema
-- Migration: 20260204_spring_memory_v3.sql
--
-- Implements the Memory v3 playbook with:
-- - Multi-scope memory notes (user/workspace/org/session/agent)
-- - Type-classified memories with rich metadata
-- - Graph edges for knowledge graph
-- - Candidate review queue for human-in-the-loop
-- - Verification workflow for memory validation
-- - Entity extraction for MindMap feature
-- ===========================================

-- ===========================================
-- 1. Spring Memory Notes (v3 Core Table)
-- ===========================================

CREATE TABLE IF NOT EXISTS spring_memory_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID,  -- Optional workspace scoping

  -- Scope determines visibility/ownership
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN (
    'user',       -- Personal memory for the user
    'workspace',  -- Shared within a workspace
    'org',        -- Shared within organization
    'session',    -- Ephemeral session memory
    'agent'       -- Agent-specific memory
  )),

  -- Memory type classification
  note_type TEXT NOT NULL DEFAULT 'fact' CHECK (note_type IN (
    'fact',         -- Factual information about the user/world
    'preference',   -- User preferences and likes/dislikes
    'instruction',  -- How the user wants to be helped
    'episode',      -- Specific event or experience
    'procedure',    -- How-to or process knowledge
    'relationship'  -- Relationships between entities
  )),

  -- Content
  content TEXT NOT NULL,                    -- Human-readable memory text
  payload_json JSONB DEFAULT '{}',          -- Structured data (entities, attributes)
  embedding VECTOR(1536),                   -- OpenAI/Voyage embedding

  -- Scoring
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  utility_score FLOAT DEFAULT 0.0,          -- Computed from usage patterns

  -- Temporal validity
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_to TIMESTAMPTZ,                     -- NULL = still valid
  last_verified_at TIMESTAMPTZ,

  -- Lifecycle status
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
    'candidate',    -- Pending review
    'active',       -- Verified and active
    'superseded',   -- Replaced by newer memory
    'contradicted', -- Invalidated by conflicting info
    'deleted'       -- Soft deleted
  )),

  -- Privacy classification
  privacy_class TEXT NOT NULL DEFAULT 'internal' CHECK (privacy_class IN (
    'public',       -- Can be shared openly
    'internal',     -- Within user's scope only
    'confidential', -- Sensitive information
    'restricted'    -- Highly sensitive, special handling
  )),

  -- Provenance tracking
  provenance_trace_id TEXT,                 -- Link to observability trace
  provenance_span_id TEXT,                  -- Specific span in trace
  source_doc_id UUID,                       -- Source document reference

  -- Session/Agent scoping
  session_id TEXT,                          -- For session-scoped memories
  agent_id TEXT,                            -- For agent-scoped memories

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 2. Spring Memory Edges (Knowledge Graph)
-- ===========================================

CREATE TABLE IF NOT EXISTS spring_memory_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  to_note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,

  -- Edge type classification
  edge_type TEXT NOT NULL CHECK (edge_type IN (
    'similar',          -- High semantic similarity
    'supersedes',       -- from_note replaces to_note
    'contradicts',      -- from_note conflicts with to_note
    'derived_from',     -- from_note was derived from to_note
    'mentions_entity',  -- Links note to entity
    'part_of_cluster'   -- Belongs to same topic cluster
  )),

  -- Edge strength and evidence
  weight FLOAT DEFAULT 1.0 CHECK (weight >= 0.0 AND weight <= 1.0),
  evidence JSONB DEFAULT '{}',              -- Supporting data for the edge

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate edges of same type
  CONSTRAINT unique_spring_memory_edge UNIQUE (from_note_id, to_note_id, edge_type)
);

-- ===========================================
-- 3. Spring Memory Candidates (Review Queue)
-- ===========================================

CREATE TABLE IF NOT EXISTS spring_memory_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Extraction context
  extraction_source TEXT,                   -- conversation, document, api, etc.
  raw_content TEXT,                         -- Original text that triggered extraction
  diff_json JSONB,                          -- Changes if this is an update

  -- Review workflow
  reviewer_action TEXT CHECK (reviewer_action IN (
    'approved',
    'rejected',
    'edited',
    'merged'
  )),
  reviewer_reason TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 4. Spring Memory Verifications
-- ===========================================

CREATE TABLE IF NOT EXISTS spring_memory_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,

  -- Verification method
  method TEXT NOT NULL CHECK (method IN (
    'user_confirm',   -- User explicitly confirmed
    'llm_check',      -- LLM verification pass
    'doc_check',      -- Document source verification
    'usage_signal'    -- Implicit from usage patterns
  )),

  -- Verification result
  result TEXT NOT NULL CHECK (result IN (
    'verified',
    'invalidated',
    'uncertain'
  )),

  -- Impact on confidence
  confidence_delta FLOAT DEFAULT 0.0,
  evidence JSONB DEFAULT '{}',              -- Verification evidence

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 5. Spring Entities (MindMap Nodes)
-- ===========================================

CREATE TABLE IF NOT EXISTS spring_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Entity identification
  name TEXT NOT NULL,
  type TEXT NOT NULL,                       -- person, place, concept, project, etc.
  aliases TEXT[] DEFAULT ARRAY[]::TEXT[],   -- Alternative names

  -- Embedding for similarity
  embedding VECTOR(1536),

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique entity per user by name+type
  CONSTRAINT unique_user_entity UNIQUE (user_id, name, type)
);

-- ===========================================
-- 6. Spring Entity Mentions
-- ===========================================

CREATE TABLE IF NOT EXISTS spring_entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES spring_entities(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES spring_memory_notes(id) ON DELETE CASCADE,

  -- Mention context
  mention_text TEXT NOT NULL,               -- The actual text that mentioned the entity
  start_offset INTEGER,                     -- Character position start
  end_offset INTEGER,                       -- Character position end

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 7. Indexes for Performance
-- ===========================================

-- spring_memory_notes indexes
CREATE INDEX IF NOT EXISTS idx_spring_notes_user
  ON spring_memory_notes(user_id) WHERE status != 'deleted';

CREATE INDEX IF NOT EXISTS idx_spring_notes_user_status
  ON spring_memory_notes(user_id, status);

CREATE INDEX IF NOT EXISTS idx_spring_notes_user_scope
  ON spring_memory_notes(user_id, scope) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_spring_notes_user_type
  ON spring_memory_notes(user_id, note_type) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_spring_notes_org
  ON spring_memory_notes(org_id) WHERE org_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_spring_notes_workspace
  ON spring_memory_notes(workspace_id) WHERE workspace_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_spring_notes_session
  ON spring_memory_notes(user_id, session_id) WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spring_notes_agent
  ON spring_memory_notes(user_id, agent_id) WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spring_notes_created
  ON spring_memory_notes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spring_notes_valid_from
  ON spring_memory_notes(valid_from DESC) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_spring_notes_privacy
  ON spring_memory_notes(user_id, privacy_class) WHERE status = 'active';

-- Vector index for semantic search (IVFFlat)
CREATE INDEX IF NOT EXISTS idx_spring_notes_embedding
  ON spring_memory_notes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE status = 'active' AND embedding IS NOT NULL;

-- spring_memory_edges indexes
CREATE INDEX IF NOT EXISTS idx_spring_edges_from
  ON spring_memory_edges(from_note_id);

CREATE INDEX IF NOT EXISTS idx_spring_edges_to
  ON spring_memory_edges(to_note_id);

CREATE INDEX IF NOT EXISTS idx_spring_edges_type
  ON spring_memory_edges(edge_type);

CREATE INDEX IF NOT EXISTS idx_spring_edges_weight
  ON spring_memory_edges(weight DESC);

-- spring_memory_candidates indexes
CREATE INDEX IF NOT EXISTS idx_spring_candidates_user
  ON spring_memory_candidates(user_id) WHERE reviewer_action IS NULL;

CREATE INDEX IF NOT EXISTS idx_spring_candidates_note
  ON spring_memory_candidates(note_id);

CREATE INDEX IF NOT EXISTS idx_spring_candidates_pending
  ON spring_memory_candidates(user_id, created_at DESC) WHERE reviewer_action IS NULL;

-- spring_memory_verifications indexes
CREATE INDEX IF NOT EXISTS idx_spring_verifications_note
  ON spring_memory_verifications(note_id);

CREATE INDEX IF NOT EXISTS idx_spring_verifications_method
  ON spring_memory_verifications(method);

-- spring_entities indexes
CREATE INDEX IF NOT EXISTS idx_spring_entities_user
  ON spring_entities(user_id);

CREATE INDEX IF NOT EXISTS idx_spring_entities_type
  ON spring_entities(user_id, type);

CREATE INDEX IF NOT EXISTS idx_spring_entities_name
  ON spring_entities(user_id, name);

-- Vector index for entity similarity
CREATE INDEX IF NOT EXISTS idx_spring_entities_embedding
  ON spring_entities
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE embedding IS NOT NULL;

-- spring_entity_mentions indexes
CREATE INDEX IF NOT EXISTS idx_spring_mentions_entity
  ON spring_entity_mentions(entity_id);

CREATE INDEX IF NOT EXISTS idx_spring_mentions_note
  ON spring_entity_mentions(note_id);

-- ===========================================
-- 8. Row Level Security
-- ===========================================

ALTER TABLE spring_memory_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_memory_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_memory_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_memory_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_entity_mentions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------
-- spring_memory_notes policies
-- ----------------------------------------

-- Users can view their own notes
CREATE POLICY "Users can view own memory notes"
  ON spring_memory_notes FOR SELECT
  USING (auth.uid()::text = user_id);

-- Users can view org-scoped notes if they're members
CREATE POLICY "Org members can view org memory notes"
  ON spring_memory_notes FOR SELECT
  USING (
    scope = 'org'
    AND org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = spring_memory_notes.org_id
      AND om.user_id = auth.uid()::text
    )
  );

-- Users can insert their own notes
CREATE POLICY "Users can insert own memory notes"
  ON spring_memory_notes FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Users can update their own notes
CREATE POLICY "Users can update own memory notes"
  ON spring_memory_notes FOR UPDATE
  USING (auth.uid()::text = user_id);

-- Users can delete their own notes
CREATE POLICY "Users can delete own memory notes"
  ON spring_memory_notes FOR DELETE
  USING (auth.uid()::text = user_id);

-- Service role bypass
CREATE POLICY "Service role has full access to memory notes"
  ON spring_memory_notes FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ----------------------------------------
-- spring_memory_edges policies
-- ----------------------------------------

-- Users can view edges for their notes
CREATE POLICY "Users can view edges for own notes"
  ON spring_memory_edges FOR SELECT
  USING (
    from_note_id IN (SELECT id FROM spring_memory_notes WHERE user_id = auth.uid()::text)
    OR to_note_id IN (SELECT id FROM spring_memory_notes WHERE user_id = auth.uid()::text)
  );

-- Users can insert edges between their notes
CREATE POLICY "Users can insert edges between own notes"
  ON spring_memory_edges FOR INSERT
  WITH CHECK (
    from_note_id IN (SELECT id FROM spring_memory_notes WHERE user_id = auth.uid()::text)
    AND to_note_id IN (SELECT id FROM spring_memory_notes WHERE user_id = auth.uid()::text)
  );

-- Users can update edges for their notes
CREATE POLICY "Users can update edges for own notes"
  ON spring_memory_edges FOR UPDATE
  USING (
    from_note_id IN (SELECT id FROM spring_memory_notes WHERE user_id = auth.uid()::text)
  );

-- Users can delete edges for their notes
CREATE POLICY "Users can delete edges for own notes"
  ON spring_memory_edges FOR DELETE
  USING (
    from_note_id IN (SELECT id FROM spring_memory_notes WHERE user_id = auth.uid()::text)
  );

-- Service role bypass
CREATE POLICY "Service role has full access to memory edges"
  ON spring_memory_edges FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ----------------------------------------
-- spring_memory_candidates policies
-- ----------------------------------------

-- Users can view their own candidates
CREATE POLICY "Users can view own candidates"
  ON spring_memory_candidates FOR SELECT
  USING (auth.uid()::text = user_id);

-- Users can insert their own candidates
CREATE POLICY "Users can insert own candidates"
  ON spring_memory_candidates FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Users can update their own candidates
CREATE POLICY "Users can update own candidates"
  ON spring_memory_candidates FOR UPDATE
  USING (auth.uid()::text = user_id);

-- Users can delete their own candidates
CREATE POLICY "Users can delete own candidates"
  ON spring_memory_candidates FOR DELETE
  USING (auth.uid()::text = user_id);

-- Service role bypass
CREATE POLICY "Service role has full access to candidates"
  ON spring_memory_candidates FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ----------------------------------------
-- spring_memory_verifications policies
-- ----------------------------------------

-- Users can view verifications for their notes
CREATE POLICY "Users can view verifications for own notes"
  ON spring_memory_verifications FOR SELECT
  USING (
    note_id IN (SELECT id FROM spring_memory_notes WHERE user_id = auth.uid()::text)
  );

-- Users can insert verifications for their notes
CREATE POLICY "Users can insert verifications for own notes"
  ON spring_memory_verifications FOR INSERT
  WITH CHECK (
    note_id IN (SELECT id FROM spring_memory_notes WHERE user_id = auth.uid()::text)
  );

-- Service role bypass
CREATE POLICY "Service role has full access to verifications"
  ON spring_memory_verifications FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ----------------------------------------
-- spring_entities policies
-- ----------------------------------------

-- Users can view their own entities
CREATE POLICY "Users can view own entities"
  ON spring_entities FOR SELECT
  USING (auth.uid()::text = user_id);

-- Users can insert their own entities
CREATE POLICY "Users can insert own entities"
  ON spring_entities FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Users can update their own entities
CREATE POLICY "Users can update own entities"
  ON spring_entities FOR UPDATE
  USING (auth.uid()::text = user_id);

-- Users can delete their own entities
CREATE POLICY "Users can delete own entities"
  ON spring_entities FOR DELETE
  USING (auth.uid()::text = user_id);

-- Service role bypass
CREATE POLICY "Service role has full access to entities"
  ON spring_entities FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ----------------------------------------
-- spring_entity_mentions policies
-- ----------------------------------------

-- Users can view mentions for their entities
CREATE POLICY "Users can view mentions for own entities"
  ON spring_entity_mentions FOR SELECT
  USING (
    entity_id IN (SELECT id FROM spring_entities WHERE user_id = auth.uid()::text)
  );

-- Users can insert mentions for their entities
CREATE POLICY "Users can insert mentions for own entities"
  ON spring_entity_mentions FOR INSERT
  WITH CHECK (
    entity_id IN (SELECT id FROM spring_entities WHERE user_id = auth.uid()::text)
  );

-- Users can delete mentions for their entities
CREATE POLICY "Users can delete mentions for own entities"
  ON spring_entity_mentions FOR DELETE
  USING (
    entity_id IN (SELECT id FROM spring_entities WHERE user_id = auth.uid()::text)
  );

-- Service role bypass
CREATE POLICY "Service role has full access to entity mentions"
  ON spring_entity_mentions FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
  );

-- ===========================================
-- 9. Helper Functions
-- ===========================================

-- Search memory notes by vector similarity
CREATE OR REPLACE FUNCTION search_spring_memory_notes(
  p_query_embedding VECTOR(1536),
  p_user_id TEXT,
  p_scope TEXT DEFAULT NULL,
  p_note_type TEXT DEFAULT NULL,
  p_match_count INTEGER DEFAULT 10,
  p_match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_type TEXT,
  scope TEXT,
  payload_json JSONB,
  confidence FLOAT,
  importance INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.content,
    n.note_type,
    n.scope,
    n.payload_json,
    n.confidence,
    n.importance,
    1 - (n.embedding <=> p_query_embedding) AS similarity
  FROM spring_memory_notes n
  WHERE n.user_id = p_user_id
    AND n.status = 'active'
    AND n.embedding IS NOT NULL
    AND (p_scope IS NULL OR n.scope = p_scope)
    AND (p_note_type IS NULL OR n.note_type = p_note_type)
    AND 1 - (n.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY n.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- Approve a memory candidate
CREATE OR REPLACE FUNCTION approve_memory_candidate(
  p_candidate_id UUID,
  p_reviewer_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_note_id UUID;
BEGIN
  -- Get the note_id from the candidate
  SELECT note_id INTO v_note_id
  FROM spring_memory_candidates
  WHERE id = p_candidate_id
    AND user_id = auth.uid()::text
    AND reviewer_action IS NULL;

  IF v_note_id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found or already reviewed';
  END IF;

  -- Update the candidate
  UPDATE spring_memory_candidates
  SET reviewer_action = 'approved',
      reviewer_reason = p_reviewer_reason,
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_candidate_id;

  -- Activate the note
  UPDATE spring_memory_notes
  SET status = 'active',
      last_verified_at = NOW(),
      updated_at = NOW()
  WHERE id = v_note_id;

  -- Record verification
  INSERT INTO spring_memory_verifications (note_id, method, result, confidence_delta, evidence)
  VALUES (v_note_id, 'user_confirm', 'verified', 0.1, jsonb_build_object(
    'action', 'approved',
    'reason', p_reviewer_reason,
    'candidate_id', p_candidate_id
  ));

  RETURN v_note_id;
END;
$$;

-- Reject a memory candidate
CREATE OR REPLACE FUNCTION reject_memory_candidate(
  p_candidate_id UUID,
  p_reviewer_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_note_id UUID;
BEGIN
  -- Get the note_id from the candidate
  SELECT note_id INTO v_note_id
  FROM spring_memory_candidates
  WHERE id = p_candidate_id
    AND user_id = auth.uid()::text
    AND reviewer_action IS NULL;

  IF v_note_id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found or already reviewed';
  END IF;

  -- Update the candidate
  UPDATE spring_memory_candidates
  SET reviewer_action = 'rejected',
      reviewer_reason = p_reviewer_reason,
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_candidate_id;

  -- Mark the note as deleted
  UPDATE spring_memory_notes
  SET status = 'deleted',
      updated_at = NOW()
  WHERE id = v_note_id;

  RETURN v_note_id;
END;
$$;

-- Get connected notes via edges (1 hop)
CREATE OR REPLACE FUNCTION get_connected_memory_notes(
  p_note_id UUID,
  p_edge_types TEXT[] DEFAULT NULL,
  p_min_weight FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  note_id UUID,
  edge_type TEXT,
  weight FLOAT,
  direction TEXT,
  evidence JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Outgoing edges
  SELECT
    e.to_note_id AS note_id,
    e.edge_type,
    e.weight,
    'outgoing'::TEXT AS direction,
    e.evidence
  FROM spring_memory_edges e
  WHERE e.from_note_id = p_note_id
    AND e.weight >= p_min_weight
    AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))

  UNION ALL

  -- Incoming edges
  SELECT
    e.from_note_id AS note_id,
    e.edge_type,
    e.weight,
    'incoming'::TEXT AS direction,
    e.evidence
  FROM spring_memory_edges e
  WHERE e.to_note_id = p_note_id
    AND e.weight >= p_min_weight
    AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))

  ORDER BY weight DESC;
END;
$$;

-- Upsert memory edge
CREATE OR REPLACE FUNCTION upsert_spring_memory_edge(
  p_from_note_id UUID,
  p_to_note_id UUID,
  p_edge_type TEXT,
  p_weight FLOAT DEFAULT 1.0,
  p_evidence JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_edge_id UUID;
BEGIN
  INSERT INTO spring_memory_edges (
    from_note_id,
    to_note_id,
    edge_type,
    weight,
    evidence
  ) VALUES (
    p_from_note_id,
    p_to_note_id,
    p_edge_type,
    p_weight,
    p_evidence
  )
  ON CONFLICT (from_note_id, to_note_id, edge_type)
  DO UPDATE SET
    weight = EXCLUDED.weight,
    evidence = EXCLUDED.evidence,
    updated_at = NOW()
  RETURNING id INTO v_edge_id;

  RETURN v_edge_id;
END;
$$;

-- Mark note as superseded
CREATE OR REPLACE FUNCTION supersede_memory_note(
  p_old_note_id UUID,
  p_new_note_id UUID,
  p_evidence JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update old note status
  UPDATE spring_memory_notes
  SET status = 'superseded',
      valid_to = NOW(),
      updated_at = NOW()
  WHERE id = p_old_note_id;

  -- Create supersedes edge
  PERFORM upsert_spring_memory_edge(
    p_new_note_id,
    p_old_note_id,
    'supersedes',
    1.0,
    p_evidence
  );
END;
$$;

-- Get pending candidates for review
CREATE OR REPLACE FUNCTION get_pending_memory_candidates(
  p_user_id TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  candidate_id UUID,
  note_id UUID,
  content TEXT,
  note_type TEXT,
  extraction_source TEXT,
  raw_content TEXT,
  diff_json JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS candidate_id,
    c.note_id,
    n.content,
    n.note_type,
    c.extraction_source,
    c.raw_content,
    c.diff_json,
    c.created_at
  FROM spring_memory_candidates c
  JOIN spring_memory_notes n ON n.id = c.note_id
  WHERE c.user_id = p_user_id
    AND c.reviewer_action IS NULL
  ORDER BY c.created_at ASC
  LIMIT p_limit;
END;
$$;

-- Get memory stats for a user
CREATE OR REPLACE FUNCTION get_spring_memory_stats(p_user_id TEXT)
RETURNS TABLE (
  total_notes BIGINT,
  active_notes BIGINT,
  candidate_notes BIGINT,
  pending_candidates BIGINT,
  total_entities BIGINT,
  total_edges BIGINT,
  by_type JSONB,
  by_scope JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM spring_memory_notes WHERE user_id = p_user_id)::BIGINT,
    (SELECT COUNT(*) FROM spring_memory_notes WHERE user_id = p_user_id AND status = 'active')::BIGINT,
    (SELECT COUNT(*) FROM spring_memory_notes WHERE user_id = p_user_id AND status = 'candidate')::BIGINT,
    (SELECT COUNT(*) FROM spring_memory_candidates WHERE user_id = p_user_id AND reviewer_action IS NULL)::BIGINT,
    (SELECT COUNT(*) FROM spring_entities WHERE user_id = p_user_id)::BIGINT,
    (SELECT COUNT(*) FROM spring_memory_edges e JOIN spring_memory_notes n ON e.from_note_id = n.id WHERE n.user_id = p_user_id)::BIGINT,
    (
      SELECT jsonb_object_agg(note_type, cnt)
      FROM (
        SELECT note_type, COUNT(*)::INTEGER AS cnt
        FROM spring_memory_notes
        WHERE user_id = p_user_id AND status = 'active'
        GROUP BY note_type
      ) t
    ),
    (
      SELECT jsonb_object_agg(scope, cnt)
      FROM (
        SELECT scope, COUNT(*)::INTEGER AS cnt
        FROM spring_memory_notes
        WHERE user_id = p_user_id AND status = 'active'
        GROUP BY scope
      ) t
    );
END;
$$;

-- Find or create entity
CREATE OR REPLACE FUNCTION upsert_spring_entity(
  p_user_id TEXT,
  p_name TEXT,
  p_type TEXT,
  p_aliases TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_embedding VECTOR(1536) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entity_id UUID;
BEGIN
  INSERT INTO spring_entities (
    user_id,
    name,
    type,
    aliases,
    embedding,
    metadata
  ) VALUES (
    p_user_id,
    p_name,
    p_type,
    p_aliases,
    p_embedding,
    p_metadata
  )
  ON CONFLICT (user_id, name, type)
  DO UPDATE SET
    aliases = array_cat(spring_entities.aliases,
      ARRAY(SELECT unnest(p_aliases) EXCEPT SELECT unnest(spring_entities.aliases))),
    embedding = COALESCE(EXCLUDED.embedding, spring_entities.embedding),
    metadata = spring_entities.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO v_entity_id;

  RETURN v_entity_id;
END;
$$;

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_spring_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
DROP TRIGGER IF EXISTS spring_memory_notes_updated_at ON spring_memory_notes;
CREATE TRIGGER spring_memory_notes_updated_at
  BEFORE UPDATE ON spring_memory_notes
  FOR EACH ROW EXECUTE FUNCTION update_spring_memory_updated_at();

DROP TRIGGER IF EXISTS spring_memory_edges_updated_at ON spring_memory_edges;
CREATE TRIGGER spring_memory_edges_updated_at
  BEFORE UPDATE ON spring_memory_edges
  FOR EACH ROW EXECUTE FUNCTION update_spring_memory_updated_at();

DROP TRIGGER IF EXISTS spring_memory_candidates_updated_at ON spring_memory_candidates;
CREATE TRIGGER spring_memory_candidates_updated_at
  BEFORE UPDATE ON spring_memory_candidates
  FOR EACH ROW EXECUTE FUNCTION update_spring_memory_updated_at();

DROP TRIGGER IF EXISTS spring_entities_updated_at ON spring_entities;
CREATE TRIGGER spring_entities_updated_at
  BEFORE UPDATE ON spring_entities
  FOR EACH ROW EXECUTE FUNCTION update_spring_memory_updated_at();

-- ===========================================
-- 10. Comments
-- ===========================================

COMMENT ON TABLE spring_memory_notes IS 'Memory v3 notes with multi-scope, type classification, and lifecycle management';
COMMENT ON COLUMN spring_memory_notes.scope IS 'Visibility scope: user, workspace, org, session, or agent';
COMMENT ON COLUMN spring_memory_notes.note_type IS 'Memory type: fact, preference, instruction, episode, procedure, relationship';
COMMENT ON COLUMN spring_memory_notes.status IS 'Lifecycle status: candidate, active, superseded, contradicted, deleted';
COMMENT ON COLUMN spring_memory_notes.privacy_class IS 'Privacy level: public, internal, confidential, restricted';
COMMENT ON COLUMN spring_memory_notes.utility_score IS 'Computed score based on retrieval frequency and usefulness';

COMMENT ON TABLE spring_memory_edges IS 'Knowledge graph edges connecting memory notes';
COMMENT ON COLUMN spring_memory_edges.edge_type IS 'Relationship type: similar, supersedes, contradicts, derived_from, mentions_entity, part_of_cluster';
COMMENT ON COLUMN spring_memory_edges.weight IS 'Edge strength from 0.0 to 1.0';

COMMENT ON TABLE spring_memory_candidates IS 'Review queue for extracted memory candidates awaiting human approval';
COMMENT ON COLUMN spring_memory_candidates.reviewer_action IS 'Review decision: approved, rejected, edited, merged';

COMMENT ON TABLE spring_memory_verifications IS 'Verification audit trail for memory confidence updates';
COMMENT ON COLUMN spring_memory_verifications.method IS 'Verification method: user_confirm, llm_check, doc_check, usage_signal';
COMMENT ON COLUMN spring_memory_verifications.result IS 'Verification outcome: verified, invalidated, uncertain';

COMMENT ON TABLE spring_entities IS 'Named entities for MindMap knowledge graph visualization';
COMMENT ON COLUMN spring_entities.type IS 'Entity type: person, place, concept, project, organization, etc.';
COMMENT ON COLUMN spring_entities.aliases IS 'Alternative names and spellings for the entity';

COMMENT ON TABLE spring_entity_mentions IS 'Links entities to memory notes where they are mentioned';
COMMENT ON COLUMN spring_entity_mentions.start_offset IS 'Character position where mention starts in the note content';
COMMENT ON COLUMN spring_entity_mentions.end_offset IS 'Character position where mention ends in the note content';
