-- Seizn compatibility patch for missing legacy memory columns

BEGIN;

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS agent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_session ON public.memories(user_id, session_id) WHERE session_id IS NOT NULL AND NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_memories_agent ON public.memories(user_id, agent_id) WHERE agent_id IS NOT NULL AND NOT is_deleted;

COMMIT;
