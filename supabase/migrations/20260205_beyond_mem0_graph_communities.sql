-- Beyond Mem0: GraphRAG Community Detection and Summaries
-- Implements hierarchical community-based retrieval

-- ============================================================
-- Graph Communities Table
-- ============================================================

CREATE TABLE IF NOT EXISTS graph_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id UUID REFERENCES knowledge_graphs(id) ON DELETE CASCADE NOT NULL,

  -- Community identification
  name TEXT,
  community_number INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 0,  -- Hierarchy level (0 = leaf)
  parent_community_id UUID REFERENCES graph_communities(id) ON DELETE SET NULL,

  -- Statistics
  member_count INT NOT NULL DEFAULT 0,
  edge_count INT NOT NULL DEFAULT 0,
  density FLOAT,  -- Internal edge density
  modularity_contribution FLOAT,
  avg_degree FLOAT,

  -- Summary (LLM-generated)
  summary TEXT,
  summary_embedding VECTOR(1024),
  summary_generated_at TIMESTAMPTZ,
  summary_version INT DEFAULT 1,

  -- Key information
  key_entities TEXT[],  -- Top entity names
  key_topics TEXT[],    -- Main topics covered
  key_relationships TEXT[],  -- Notable relationship types

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Community Membership
-- ============================================================

CREATE TABLE IF NOT EXISTS graph_community_members (
  community_id UUID REFERENCES graph_communities(id) ON DELETE CASCADE NOT NULL,
  entity_id UUID REFERENCES graph_entities(id) ON DELETE CASCADE NOT NULL,

  -- Membership details
  membership_score FLOAT DEFAULT 1.0,  -- How strongly entity belongs
  is_hub BOOLEAN DEFAULT FALSE,        -- Bridge/hub entity
  joined_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (community_id, entity_id)
);

-- ============================================================
-- Community Detection Runs
-- ============================================================

CREATE TABLE IF NOT EXISTS graph_community_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id UUID REFERENCES knowledge_graphs(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Algorithm configuration
  algorithm VARCHAR(20) NOT NULL DEFAULT 'louvain',  -- louvain, leiden
  resolution FLOAT DEFAULT 1.0,
  min_community_size INT DEFAULT 3,
  max_levels INT DEFAULT 3,

  -- Results
  status VARCHAR(20) NOT NULL DEFAULT 'running',  -- running, completed, failed
  communities_detected INT,
  levels_created INT,
  modularity_score FLOAT,
  processing_ms INT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- ============================================================
-- Indexes
-- ============================================================

-- Community queries
CREATE INDEX IF NOT EXISTS idx_communities_graph_level
ON graph_communities (graph_id, level);

CREATE INDEX IF NOT EXISTS idx_communities_parent
ON graph_communities (parent_community_id)
WHERE parent_community_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communities_member_count
ON graph_communities (graph_id, member_count DESC);

-- Summary search (vector similarity)
CREATE INDEX IF NOT EXISTS idx_communities_summary_embedding
ON graph_communities USING hnsw (summary_embedding vector_cosine_ops)
WHERE summary_embedding IS NOT NULL;

-- Membership queries
CREATE INDEX IF NOT EXISTS idx_community_members_entity
ON graph_community_members (entity_id);

CREATE INDEX IF NOT EXISTS idx_community_members_hub
ON graph_community_members (community_id)
WHERE is_hub = TRUE;

-- Run tracking
CREATE INDEX IF NOT EXISTS idx_community_runs_graph_status
ON graph_community_runs (graph_id, status, started_at DESC);

-- ============================================================
-- Functions: Community Search
-- ============================================================

-- Find relevant communities by query embedding
CREATE OR REPLACE FUNCTION search_communities_by_embedding(
  p_graph_id UUID,
  p_query_embedding VECTOR(1024),
  p_top_k INT DEFAULT 5,
  p_min_level INT DEFAULT 0,
  p_max_level INT DEFAULT 10
) RETURNS TABLE (
  community_id UUID,
  name TEXT,
  level INT,
  member_count INT,
  summary TEXT,
  key_entities TEXT[],
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS community_id,
    c.name,
    c.level,
    c.member_count,
    c.summary,
    c.key_entities,
    (1 - (c.summary_embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM graph_communities c
  WHERE c.graph_id = p_graph_id
    AND c.summary_embedding IS NOT NULL
    AND c.level >= p_min_level
    AND c.level <= p_max_level
  ORDER BY c.summary_embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$ LANGUAGE plpgsql;

-- Get community hierarchy (children of a community)
CREATE OR REPLACE FUNCTION get_community_children(
  p_community_id UUID
) RETURNS TABLE (
  community_id UUID,
  name TEXT,
  level INT,
  member_count INT,
  summary TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS community_id,
    c.name,
    c.level,
    c.member_count,
    c.summary
  FROM graph_communities c
  WHERE c.parent_community_id = p_community_id
  ORDER BY c.member_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Get entities in a community
CREATE OR REPLACE FUNCTION get_community_entities(
  p_community_id UUID,
  p_limit INT DEFAULT 50
) RETURNS TABLE (
  entity_id UUID,
  name TEXT,
  entity_type VARCHAR,
  membership_score FLOAT,
  is_hub BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id AS entity_id,
    e.name,
    e.entity_type,
    cm.membership_score,
    cm.is_hub
  FROM graph_community_members cm
  JOIN graph_entities e ON e.id = cm.entity_id
  WHERE cm.community_id = p_community_id
  ORDER BY cm.membership_score DESC, cm.is_hub DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Functions: Community Statistics
-- ============================================================

-- Calculate community density
CREATE OR REPLACE FUNCTION calculate_community_density(
  p_community_id UUID
) RETURNS FLOAT AS $$
DECLARE
  v_member_count INT;
  v_edge_count INT;
  v_max_edges INT;
BEGIN
  -- Get member count
  SELECT COUNT(*) INTO v_member_count
  FROM graph_community_members
  WHERE community_id = p_community_id;

  IF v_member_count < 2 THEN
    RETURN 0;
  END IF;

  -- Get internal edge count
  SELECT COUNT(*) INTO v_edge_count
  FROM graph_relations r
  WHERE EXISTS (
    SELECT 1 FROM graph_community_members cm1
    WHERE cm1.community_id = p_community_id AND cm1.entity_id = r.source_entity_id
  )
  AND EXISTS (
    SELECT 1 FROM graph_community_members cm2
    WHERE cm2.community_id = p_community_id AND cm2.entity_id = r.target_entity_id
  );

  -- Maximum possible edges (for undirected: n*(n-1)/2)
  v_max_edges := v_member_count * (v_member_count - 1) / 2;

  IF v_max_edges = 0 THEN
    RETURN 0;
  END IF;

  RETURN v_edge_count::FLOAT / v_max_edges::FLOAT;
END;
$$ LANGUAGE plpgsql;

-- Update community statistics
CREATE OR REPLACE FUNCTION update_community_stats(
  p_community_id UUID
) RETURNS VOID AS $$
DECLARE
  v_member_count INT;
  v_edge_count INT;
  v_density FLOAT;
  v_key_entities TEXT[];
BEGIN
  -- Count members
  SELECT COUNT(*) INTO v_member_count
  FROM graph_community_members
  WHERE community_id = p_community_id;

  -- Count internal edges
  SELECT COUNT(*) INTO v_edge_count
  FROM graph_relations r
  WHERE EXISTS (
    SELECT 1 FROM graph_community_members cm1
    WHERE cm1.community_id = p_community_id AND cm1.entity_id = r.source_entity_id
  )
  AND EXISTS (
    SELECT 1 FROM graph_community_members cm2
    WHERE cm2.community_id = p_community_id AND cm2.entity_id = r.target_entity_id
  );

  -- Calculate density
  v_density := calculate_community_density(p_community_id);

  -- Get top 5 key entities
  SELECT ARRAY(
    SELECT e.name
    FROM graph_community_members cm
    JOIN graph_entities e ON e.id = cm.entity_id
    WHERE cm.community_id = p_community_id
    ORDER BY cm.membership_score DESC, cm.is_hub DESC
    LIMIT 5
  ) INTO v_key_entities;

  -- Update community
  UPDATE graph_communities
  SET
    member_count = v_member_count,
    edge_count = v_edge_count,
    density = v_density,
    key_entities = v_key_entities,
    updated_at = NOW()
  WHERE id = p_community_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-update community stats on membership change
CREATE OR REPLACE FUNCTION trg_update_community_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM update_community_stats(NEW.community_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_community_stats(OLD.community_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_membership_stats ON graph_community_members;
CREATE TRIGGER trg_community_membership_stats
AFTER INSERT OR UPDATE OR DELETE ON graph_community_members
FOR EACH ROW EXECUTE FUNCTION trg_update_community_stats();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE graph_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_community_runs ENABLE ROW LEVEL SECURITY;

-- Communities inherit graph permissions (simplified)
CREATE POLICY communities_select ON graph_communities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM knowledge_graphs g
      WHERE g.id = graph_communities.graph_id
        AND (g.is_public = TRUE OR g.user_id = auth.uid()::text)
    )
  );

CREATE POLICY communities_all ON graph_communities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM knowledge_graphs g
      WHERE g.id = graph_communities.graph_id
        AND g.user_id = auth.uid()::text
    )
  );

-- Members follow community permissions
CREATE POLICY community_members_select ON graph_community_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM graph_communities c
      JOIN knowledge_graphs g ON g.id = c.graph_id
      WHERE c.id = graph_community_members.community_id
        AND (g.is_public = TRUE OR g.user_id = auth.uid()::text)
    )
  );

CREATE POLICY community_members_all ON graph_community_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM graph_communities c
      JOIN knowledge_graphs g ON g.id = c.graph_id
      WHERE c.id = graph_community_members.community_id
        AND g.user_id = auth.uid()::text
    )
  );

-- Runs are user-scoped
CREATE POLICY community_runs_select ON graph_community_runs
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY community_runs_all ON graph_community_runs
  FOR ALL USING (auth.uid()::text = user_id);

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE graph_communities IS 'Hierarchical communities detected in knowledge graphs using Louvain/Leiden algorithms';
COMMENT ON TABLE graph_community_members IS 'Entity membership in communities with scores and hub identification';
COMMENT ON TABLE graph_community_runs IS 'Tracking of community detection algorithm runs';
COMMENT ON COLUMN graph_communities.level IS '0 = leaf community, higher = more aggregated';
COMMENT ON COLUMN graph_communities.density IS 'Ratio of actual edges to maximum possible edges within community';
COMMENT ON COLUMN graph_community_members.is_hub IS 'Entity that bridges multiple communities or has high connectivity';
