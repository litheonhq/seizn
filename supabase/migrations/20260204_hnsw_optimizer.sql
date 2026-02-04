-- ============================================
-- HNSW Optimizer Support
-- Phase 7: pgvector HNSW optimization
-- ============================================

-- Function to get index statistics
CREATE OR REPLACE FUNCTION get_index_stats(
    p_table_name TEXT,
    p_index_name TEXT
)
RETURNS TABLE (
    relname TEXT,
    indexrelname TEXT,
    idx_scan BIGINT,
    idx_tup_read BIGINT,
    idx_tup_fetch BIGINT,
    idx_size TEXT,
    idx_size_bytes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.relname::TEXT,
        i.indexrelname::TEXT,
        i.idx_scan,
        i.idx_tup_read,
        i.idx_tup_fetch,
        pg_size_pretty(pg_relation_size(i.indexrelid::regclass)) AS idx_size,
        pg_relation_size(i.indexrelid::regclass) AS idx_size_bytes
    FROM pg_stat_user_indexes i
    JOIN pg_stat_user_tables t ON i.relid = t.relid
    WHERE t.relname = p_table_name
    AND i.indexrelname = p_index_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get HNSW index parameters (requires pg_catalog access)
CREATE OR REPLACE FUNCTION get_hnsw_index_info(p_index_name TEXT)
RETURNS TABLE (
    index_name TEXT,
    table_name TEXT,
    index_size TEXT,
    index_size_bytes BIGINT,
    tuples BIGINT,
    dead_tuples BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.indexrelname::TEXT AS index_name,
        t.relname::TEXT AS table_name,
        pg_size_pretty(pg_relation_size(i.indexrelid::regclass)) AS index_size,
        pg_relation_size(i.indexrelid::regclass) AS index_size_bytes,
        t.n_live_tup AS tuples,
        t.n_dead_tup AS dead_tuples
    FROM pg_stat_user_indexes i
    JOIN pg_stat_user_tables t ON i.relid = t.relid
    WHERE i.indexrelname = p_index_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to recommend ef_search based on collection stats
CREATE OR REPLACE FUNCTION recommend_ef_search(
    p_collection_id UUID,
    p_top_k INT DEFAULT 10,
    p_recall_mode TEXT DEFAULT 'balanced'  -- 'fast', 'balanced', 'high_recall'
)
RETURNS INT AS $$
DECLARE
    vec_count BIGINT;
    base_ef INT;
BEGIN
    -- Get vector count for collection
    SELECT COUNT(*)
    INTO vec_count
    FROM summer_chunks
    WHERE collection_id = p_collection_id
    AND embedding IS NOT NULL;

    -- Base ef_search: 4x top_k
    base_ef := p_top_k * 4;

    -- Adjust based on collection size
    IF vec_count > 1000000 THEN
        base_ef := base_ef * 1.5;
    ELSIF vec_count > 100000 THEN
        base_ef := base_ef * 1.25;
    END IF;

    -- Adjust based on recall mode
    IF p_recall_mode = 'fast' THEN
        base_ef := GREATEST(16, base_ef * 0.6);
    ELSIF p_recall_mode = 'high_recall' THEN
        base_ef := LEAST(500, base_ef * 2);
    END IF;

    -- Clamp to valid range
    RETURN GREATEST(10, LEAST(500, base_ef));
END;
$$ LANGUAGE plpgsql;

-- Table to track HNSW tuning history
CREATE TABLE IF NOT EXISTS hnsw_tuning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Target info
    table_name TEXT NOT NULL,
    index_name TEXT NOT NULL,

    -- Parameters before change
    prev_m INT,
    prev_ef_construction INT,
    prev_ef_search INT,

    -- Parameters after change
    new_m INT,
    new_ef_construction INT,
    new_ef_search INT,

    -- Metrics
    vector_count BIGINT,
    index_size_before_bytes BIGINT,
    index_size_after_bytes BIGINT,
    build_time_ms BIGINT,

    -- Change metadata
    change_reason TEXT,
    triggered_by TEXT,  -- 'auto', 'manual', 'scheduled'

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ
);

-- Index for querying tuning history
CREATE INDEX IF NOT EXISTS idx_hnsw_tuning_org
    ON hnsw_tuning_history(organization_id, created_at DESC);

-- Enable RLS
ALTER TABLE hnsw_tuning_history ENABLE ROW LEVEL SECURITY;

-- Policy: Organization members can read their tuning history
CREATE POLICY "org_read_hnsw_tuning" ON hnsw_tuning_history
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

-- Policy: Only admins/service can insert
CREATE POLICY "admin_insert_hnsw_tuning" ON hnsw_tuning_history
    FOR INSERT WITH CHECK (
        auth.jwt() ->> 'role' = 'service_role'
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================
-- Performance Monitoring Views
-- ============================================

-- View for HNSW index health monitoring
CREATE OR REPLACE VIEW hnsw_index_health AS
SELECT
    i.indexrelname AS index_name,
    t.relname AS table_name,
    t.n_live_tup AS live_tuples,
    t.n_dead_tup AS dead_tuples,
    CASE
        WHEN t.n_dead_tup > t.n_live_tup * 0.1 THEN 'needs_vacuum'
        WHEN i.idx_scan = 0 THEN 'unused'
        ELSE 'healthy'
    END AS status,
    pg_size_pretty(pg_relation_size(i.indexrelid::regclass)) AS index_size,
    i.idx_scan AS total_scans,
    i.idx_tup_read AS tuples_read,
    i.idx_tup_fetch AS tuples_fetched,
    CASE
        WHEN i.idx_tup_read > 0 THEN
            ROUND((i.idx_tup_fetch::NUMERIC / i.idx_tup_read) * 100, 2)
        ELSE 0
    END AS fetch_efficiency_pct
FROM pg_stat_user_indexes i
JOIN pg_stat_user_tables t ON i.relid = t.relid
WHERE i.indexrelname LIKE '%hnsw%'
    OR i.indexrelname LIKE '%embedding%';

-- Grant access to the view
GRANT SELECT ON hnsw_index_health TO authenticated;

-- ============================================
-- Comments
-- ============================================

COMMENT ON FUNCTION get_index_stats IS 'Get statistics for a specific index';
COMMENT ON FUNCTION get_hnsw_index_info IS 'Get HNSW index information and size';
COMMENT ON FUNCTION recommend_ef_search IS 'Recommend ef_search parameter based on collection stats';
COMMENT ON TABLE hnsw_tuning_history IS 'History of HNSW parameter changes for audit';
COMMENT ON VIEW hnsw_index_health IS 'Monitoring view for HNSW index health';
