-- 20260421003_memory_budget.sql
-- Adds per-entity hot/warm/cold budgets to the legacy v1 memories table.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'hot',
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_recalled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recall_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS size_bytes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.memories
  DROP CONSTRAINT IF EXISTS memories_tier_check;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_tier_check
  CHECK (tier IN ('hot', 'warm', 'cold'));

UPDATE public.memories
SET entity_id = COALESCE(agent_id, session_id, user_id)
WHERE entity_id IS NULL;

UPDATE public.memories
SET size_bytes = GREATEST(octet_length(COALESCE(content, '')::text), 0)
WHERE COALESCE(size_bytes, 0) = 0;

CREATE INDEX IF NOT EXISTS memories_tier_recall_idx
  ON public.memories (organization_id, entity_id, tier, last_recalled_at DESC NULLS LAST)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS memories_budget_pin_idx
  ON public.memories (organization_id, entity_id, pinned, tier)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS public.entity_budget (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  hot_budget_bytes BIGINT NOT NULL DEFAULT 65536,
  warm_budget_bytes BIGINT NOT NULL DEFAULT 524288,
  cold_budget_bytes BIGINT,
  hot_used_bytes BIGINT NOT NULL DEFAULT 0,
  warm_used_bytes BIGINT NOT NULL DEFAULT 0,
  cold_used_bytes BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, entity_id)
);

CREATE TABLE IF NOT EXISTS public.memory_budget_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('write', 'recall', 'demote', 'promote')),
  from_tier TEXT CHECK (from_tier IS NULL OR from_tier IN ('hot', 'warm', 'cold')),
  to_tier TEXT CHECK (to_tier IS NULL OR to_tier IN ('hot', 'warm', 'cold')),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_budget_events_org_entity_created_idx
  ON public.memory_budget_events (organization_id, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_budget_events_type_created_idx
  ON public.memory_budget_events (event_type, created_at DESC);

ALTER TABLE public.entity_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_budget_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view entity budgets" ON public.entity_budget;
CREATE POLICY "Members can view entity budgets"
  ON public.entity_budget FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = entity_budget.organization_id
        AND om.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Service role manages entity budgets" ON public.entity_budget;
CREATE POLICY "Service role manages entity budgets"
  ON public.entity_budget FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members can view memory budget events" ON public.memory_budget_events;
CREATE POLICY "Members can view memory budget events"
  ON public.memory_budget_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = memory_budget_events.organization_id
        AND om.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Service role manages memory budget events" ON public.memory_budget_events;
CREATE POLICY "Service role manages memory budget events"
  ON public.memory_budget_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON COLUMN public.memories.entity_id IS
  'Designer/runtime entity whose memory budget owns this memory. Defaults to agent_id, then session_id, then user_id.';
COMMENT ON COLUMN public.memories.tier IS
  'Budget tier for memory paging: hot, warm, or cold.';
COMMENT ON COLUMN public.memories.pinned IS
  'When true, the budget engine will not demote this memory automatically.';
COMMENT ON TABLE public.entity_budget IS
  'Per-organization, per-entity memory tier budget and usage counters.';
COMMENT ON TABLE public.memory_budget_events IS
  'Append-only telemetry for budget writes, recalls, promotions, and demotions.';

NOTIFY pgrst, 'reload schema';
