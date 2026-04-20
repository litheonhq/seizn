-- 20260421005_memory_decay_policies.sql
-- Per-memory forgetting curves and org-scoped decay policies.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS memory_class TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS half_life_hours REAL,
  ADD COLUMN IF NOT EXISTS base_strength REAL NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS last_reinforced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS memories_decay_class_idx
  ON public.memories (organization_id, memory_class, last_reinforced_at DESC NULLS LAST)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS public.decay_policies (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  memory_class TEXT NOT NULL,
  half_life_hours REAL,
  min_strength REAL NOT NULL DEFAULT 0.05,
  reinforce_boost REAL NOT NULL DEFAULT 0.2,
  rerank_weight REAL NOT NULL DEFAULT 0.15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, memory_class),
  CHECK (half_life_hours IS NULL OR half_life_hours > 0),
  CHECK (min_strength >= 0 AND min_strength <= 1),
  CHECK (reinforce_boost >= 0 AND reinforce_boost <= 1),
  CHECK (rerank_weight >= 0 AND rerank_weight <= 1)
);

ALTER TABLE public.decay_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view decay policies" ON public.decay_policies;
CREATE POLICY "Members can view decay policies"
  ON public.decay_policies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = decay_policies.organization_id
        AND om.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Service role manages decay policies" ON public.decay_policies;
CREATE POLICY "Service role manages decay policies"
  ON public.decay_policies FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON COLUMN public.memories.memory_class IS
  'Designer-authored class used to select a decay policy.';
COMMENT ON COLUMN public.memories.half_life_hours IS
  'Optional per-memory half-life override. NULL means use policy or never decay.';
COMMENT ON COLUMN public.memories.base_strength IS
  'Current reinforced memory strength before time decay is applied.';
COMMENT ON COLUMN public.memories.last_reinforced_at IS
  'Last time recall reinforced this memory.';
COMMENT ON TABLE public.decay_policies IS
  'Org-scoped forgetting curve policies by memory_class.';

NOTIFY pgrst, 'reload schema';
