-- Memory Optimization Schema Updates
-- Adds columns and functions for AI-powered memory optimization

-- Add optimization-related columns to memories table
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES memories(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for optimization queries
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed
ON memories(user_id, last_accessed_at)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_memories_importance
ON memories(user_id, importance)
WHERE is_deleted = false;

-- Function to increment memory access count
CREATE OR REPLACE FUNCTION increment_memory_access(memory_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE memories
  SET
    access_count = COALESCE(access_count, 0) + 1,
    last_accessed_at = NOW()
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find similar memories using vector similarity
CREATE OR REPLACE FUNCTION find_similar_memories(
  target_user_id UUID,
  similarity_threshold FLOAT DEFAULT 0.85,
  max_results INTEGER DEFAULT 50
)
RETURNS TABLE (
  memory1_id UUID,
  memory1_content TEXT,
  memory2_id UUID,
  memory2_content TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m1.id AS memory1_id,
    m1.content AS memory1_content,
    m2.id AS memory2_id,
    m2.content AS memory2_content,
    1 - (m1.embedding <=> m2.embedding) AS similarity
  FROM memories m1
  CROSS JOIN memories m2
  WHERE m1.user_id = target_user_id
    AND m2.user_id = target_user_id
    AND m1.id < m2.id  -- Avoid duplicates and self-comparison
    AND m1.is_deleted = false
    AND m2.is_deleted = false
    AND 1 - (m1.embedding <=> m2.embedding) >= similarity_threshold
  ORDER BY similarity DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to apply memory decay (reduce importance of stale memories)
CREATE OR REPLACE FUNCTION apply_memory_decay(
  target_user_id UUID,
  days_threshold INTEGER DEFAULT 60,
  decay_amount INTEGER DEFAULT 1
)
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE memories
  SET importance = GREATEST(1, importance - decay_amount)
  WHERE user_id = target_user_id
    AND is_deleted = false
    AND last_accessed_at < NOW() - (days_threshold || ' days')::INTERVAL
    AND importance > 1;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update search_memories to also track access
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1024),
  match_user_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  tags TEXT[],
  namespace TEXT,
  importance INT,
  similarity FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.tags,
    m.namespace,
    m.importance,
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.created_at
  FROM memories m
  WHERE m.user_id = match_user_id
    AND m.is_deleted = false
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at on memory changes
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_memories_updated_at ON memories;
CREATE TRIGGER update_memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();
