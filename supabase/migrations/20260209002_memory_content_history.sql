-- Memory Content History (versioning)
-- Tracks content changes to memories for auditing and rollback.

CREATE TABLE IF NOT EXISTS memory_content_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  memory_type TEXT,
  tags TEXT[],
  importance INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  changed_by TEXT DEFAULT 'api', -- 'user', 'api', 'system', 'mcp'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mch_memory_id ON memory_content_history(memory_id);
CREATE INDEX IF NOT EXISTS idx_mch_created_at ON memory_content_history(created_at DESC);

-- RLS
ALTER TABLE memory_content_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history of own memories"
  ON memory_content_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memories m
      WHERE m.id = memory_content_history.memory_id
        AND m.user_id = auth.uid()::text
    )
  );

-- Service role full access
CREATE POLICY "Service role full access on memory_content_history"
  ON memory_content_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger: auto-save history on content update
CREATE OR REPLACE FUNCTION save_memory_content_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content
    OR OLD.memory_type IS DISTINCT FROM NEW.memory_type
    OR OLD.tags IS DISTINCT FROM NEW.tags
    OR OLD.importance IS DISTINCT FROM NEW.importance THEN

    INSERT INTO memory_content_history (memory_id, content, memory_type, tags, importance, version, changed_by)
    VALUES (
      OLD.id,
      OLD.content,
      OLD.memory_type,
      OLD.tags,
      OLD.importance,
      COALESCE(
        (SELECT MAX(version) + 1 FROM memory_content_history WHERE memory_id = OLD.id),
        1
      ),
      'system'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to allow re-run
DROP TRIGGER IF EXISTS trg_memory_content_history ON memories;

CREATE TRIGGER trg_memory_content_history
BEFORE UPDATE ON memories
FOR EACH ROW
EXECUTE FUNCTION save_memory_content_history();
