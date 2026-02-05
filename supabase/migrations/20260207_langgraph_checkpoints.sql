-- LangGraph Checkpoints table
-- Stores StateGraph checkpoints for time-travel debugging

CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT NOT NULL DEFAULT 'json',
  checkpoint JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS langgraph_writes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'json',
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lg_checkpoints_thread ON langgraph_checkpoints(thread_id, checkpoint_ns);
CREATE INDEX IF NOT EXISTS idx_lg_writes_checkpoint ON langgraph_writes(thread_id, checkpoint_ns, checkpoint_id);

-- RLS
ALTER TABLE langgraph_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph_writes ENABLE ROW LEVEL SECURITY;
