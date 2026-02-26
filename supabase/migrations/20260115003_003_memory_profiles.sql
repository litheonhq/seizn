-- Migration: Memory Profiles + Compaction (Phase 3)
-- Profile cards provide instant context loading at conversation start.
-- Compaction reduces storage and improves warm search performance.

-- ============================================================================
-- 1. Memory Profiles Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT 'default',

    -- Profile card content (compressed summary, max 2KB)
    profile_card TEXT NOT NULL,
    profile_card_embedding vector(1024),

    -- Slot snapshot (JSON copy of current slots for fast loading)
    slot_snapshot JSONB DEFAULT '{}',

    -- Statistics
    memory_count INTEGER DEFAULT 0,
    slot_count INTEGER DEFAULT 0,
    cluster_count INTEGER DEFAULT 0,

    -- Version tracking
    version INTEGER DEFAULT 1,
    last_memory_id UUID, -- Last memory included in profile

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique: one profile per user/namespace
    UNIQUE(user_id, namespace)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_profiles_user_namespace
    ON memory_profiles(user_id, namespace);

-- ============================================================================
-- 2. Memory Clusters Table (for compaction)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT 'default',

    -- Cluster metadata
    cluster_name TEXT NOT NULL,
    cluster_type TEXT NOT NULL DEFAULT 'topic', -- topic, temporal, semantic

    -- Cluster summary (compressed representation)
    summary TEXT NOT NULL,
    summary_embedding vector(1024),

    -- Member memories
    member_ids UUID[] DEFAULT '{}',
    member_count INTEGER DEFAULT 0,

    -- Importance score (aggregated from members)
    importance DECIMAL(4,2) DEFAULT 5.0,

    -- Status
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_clusters_user_namespace
    ON memory_clusters(user_id, namespace);

CREATE INDEX IF NOT EXISTS idx_memory_clusters_type
    ON memory_clusters(user_id, cluster_type);

CREATE INDEX IF NOT EXISTS idx_memory_clusters_not_archived
    ON memory_clusters(user_id, namespace) WHERE is_archived = false;

-- ============================================================================
-- 3. Memory Archive Table (cold storage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_archive (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT 'default',

    -- Original memory data
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    importance INTEGER DEFAULT 5,

    -- Reference to cluster
    cluster_id UUID REFERENCES memory_clusters(id) ON DELETE SET NULL,

    -- Archive metadata
    original_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archive_reason TEXT DEFAULT 'compaction'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_archive_user_namespace
    ON memory_archive(user_id, namespace);

CREATE INDEX IF NOT EXISTS idx_memory_archive_cluster
    ON memory_archive(cluster_id);

-- ============================================================================
-- 4. Functions
-- ============================================================================

-- Get or create profile for a user/namespace
CREATE OR REPLACE FUNCTION get_or_create_profile(
    p_user_id UUID,
    p_namespace TEXT DEFAULT 'default'
)
RETURNS memory_profiles AS $$
DECLARE
    result memory_profiles;
BEGIN
    -- Try to get existing profile
    SELECT * INTO result
    FROM memory_profiles
    WHERE user_id = p_user_id AND namespace = p_namespace;

    -- Create if not exists
    IF NOT FOUND THEN
        INSERT INTO memory_profiles (user_id, namespace, profile_card)
        VALUES (p_user_id, p_namespace, '')
        RETURNING * INTO result;
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update profile card
CREATE OR REPLACE FUNCTION update_profile_card(
    p_user_id UUID,
    p_namespace TEXT,
    p_profile_card TEXT,
    p_profile_card_embedding vector(1024) DEFAULT NULL,
    p_slot_snapshot JSONB DEFAULT NULL,
    p_memory_count INTEGER DEFAULT NULL,
    p_slot_count INTEGER DEFAULT NULL,
    p_cluster_count INTEGER DEFAULT NULL,
    p_last_memory_id UUID DEFAULT NULL
)
RETURNS memory_profiles AS $$
DECLARE
    result memory_profiles;
BEGIN
    INSERT INTO memory_profiles (
        user_id, namespace, profile_card, profile_card_embedding,
        slot_snapshot, memory_count, slot_count, cluster_count, last_memory_id
    ) VALUES (
        p_user_id, p_namespace, p_profile_card, p_profile_card_embedding,
        COALESCE(p_slot_snapshot, '{}'), COALESCE(p_memory_count, 0),
        COALESCE(p_slot_count, 0), COALESCE(p_cluster_count, 0), p_last_memory_id
    )
    ON CONFLICT (user_id, namespace)
    DO UPDATE SET
        profile_card = EXCLUDED.profile_card,
        profile_card_embedding = COALESCE(EXCLUDED.profile_card_embedding, memory_profiles.profile_card_embedding),
        slot_snapshot = COALESCE(EXCLUDED.slot_snapshot, memory_profiles.slot_snapshot),
        memory_count = COALESCE(EXCLUDED.memory_count, memory_profiles.memory_count),
        slot_count = COALESCE(EXCLUDED.slot_count, memory_profiles.slot_count),
        cluster_count = COALESCE(EXCLUDED.cluster_count, memory_profiles.cluster_count),
        last_memory_id = COALESCE(EXCLUDED.last_memory_id, memory_profiles.last_memory_id),
        version = memory_profiles.version + 1,
        updated_at = NOW()
    RETURNING * INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Get memories for clustering (candidates for compaction)
CREATE OR REPLACE FUNCTION get_compaction_candidates(
    p_user_id UUID,
    p_namespace TEXT DEFAULT 'default',
    p_min_age_days INTEGER DEFAULT 30,
    p_max_importance INTEGER DEFAULT 3,
    p_limit INTEGER DEFAULT 100
)
RETURNS SETOF memories AS $$
BEGIN
    RETURN QUERY
    SELECT m.*
    FROM memories m
    WHERE m.user_id = p_user_id
      AND m.namespace = COALESCE(p_namespace, 'default')
      AND m.is_deleted = false
      AND m.created_at < NOW() - (p_min_age_days || ' days')::INTERVAL
      AND m.importance <= p_max_importance
      AND NOT EXISTS (
          SELECT 1 FROM memory_archive ma WHERE ma.id = m.id
      )
    ORDER BY m.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Archive memories after clustering
CREATE OR REPLACE FUNCTION archive_memories(
    p_memory_ids UUID[],
    p_cluster_id UUID,
    p_archive_reason TEXT DEFAULT 'compaction'
)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER := 0;
BEGIN
    -- Insert into archive
    INSERT INTO memory_archive (id, user_id, namespace, content, memory_type, tags, importance, cluster_id, original_created_at, archive_reason)
    SELECT m.id, m.user_id, m.namespace, m.content, m.memory_type, m.tags, m.importance, p_cluster_id, m.created_at, p_archive_reason
    FROM memories m
    WHERE m.id = ANY(p_memory_ids)
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS archived_count = ROW_COUNT;

    -- Soft delete from memories table
    UPDATE memories
    SET is_deleted = true, deleted_at = NOW()
    WHERE id = ANY(p_memory_ids);

    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- Search clusters (for hybrid retrieval)
CREATE OR REPLACE FUNCTION search_clusters(
    p_query_embedding vector(1024),
    p_user_id UUID,
    p_namespace TEXT DEFAULT 'default',
    p_match_count INTEGER DEFAULT 5,
    p_match_threshold DECIMAL DEFAULT 0.6
)
RETURNS TABLE (
    id UUID,
    cluster_name TEXT,
    summary TEXT,
    member_count INTEGER,
    importance DECIMAL,
    similarity DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mc.id,
        mc.cluster_name,
        mc.summary,
        mc.member_count,
        mc.importance,
        (1 - (mc.summary_embedding <=> p_query_embedding))::DECIMAL AS similarity
    FROM memory_clusters mc
    WHERE mc.user_id = p_user_id
      AND mc.namespace = COALESCE(p_namespace, 'default')
      AND mc.is_archived = false
      AND (1 - (mc.summary_embedding <=> p_query_embedding)) >= p_match_threshold
    ORDER BY mc.summary_embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

-- memory_profiles
ALTER TABLE memory_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_profiles_user_policy ON memory_profiles
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY memory_profiles_service_policy ON memory_profiles
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- memory_clusters
ALTER TABLE memory_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_clusters_user_policy ON memory_clusters
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY memory_clusters_service_policy ON memory_clusters
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- memory_archive
ALTER TABLE memory_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_archive_user_policy ON memory_archive
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY memory_archive_service_policy ON memory_archive
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. Comments
-- ============================================================================

COMMENT ON TABLE memory_profiles IS 'Compressed profile cards for instant context loading';
COMMENT ON TABLE memory_clusters IS 'Clustered memory summaries for efficient retrieval';
COMMENT ON TABLE memory_archive IS 'Cold storage for compacted memories';
COMMENT ON FUNCTION get_or_create_profile IS 'Get existing or create new profile for user/namespace';
COMMENT ON FUNCTION update_profile_card IS 'Update profile card with new summary and stats';
COMMENT ON FUNCTION get_compaction_candidates IS 'Get old, low-importance memories for clustering';
COMMENT ON FUNCTION archive_memories IS 'Move memories to archive after clustering';
COMMENT ON FUNCTION search_clusters IS 'Search cluster summaries for hybrid retrieval';
