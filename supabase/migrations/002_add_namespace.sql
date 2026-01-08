-- Add namespace column for multi-tenant/project isolation
ALTER TABLE memories ADD COLUMN IF NOT EXISTS namespace TEXT DEFAULT 'default';

-- Add index for namespace queries
CREATE INDEX IF NOT EXISTS idx_memories_namespace ON memories(user_id, namespace) WHERE NOT is_deleted;

-- Update search_memories function to support namespace
CREATE OR REPLACE FUNCTION search_memories(
    query_embedding VECTOR(1024),
    match_user_id UUID,
    match_count INTEGER DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.7,
    match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    memory_type TEXT,
    tags TEXT[],
    namespace TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.memory_type,
        m.tags,
        m.namespace,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE m.user_id = match_user_id
        AND NOT m.is_deleted
        AND 1 - (m.embedding <=> query_embedding) > match_threshold
        AND (match_namespace IS NULL OR m.namespace = match_namespace)
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
