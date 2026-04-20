-- 20260421004_belief_shards.sql
-- Theory-of-Mind belief shards for perspective-aware memory recall.

CREATE TABLE IF NOT EXISTS public.belief_shards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  holder_entity_id TEXT NOT NULL,
  about_fact_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  witness_event_id UUID,
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  revoked_at TIMESTAMPTZ,
  source_type TEXT NOT NULL CHECK (source_type IN ('direct', 'told', 'inferred', 'rumor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS belief_shards_holder_obs_idx
  ON public.belief_shards (organization_id, holder_entity_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS belief_shards_fact_idx
  ON public.belief_shards (organization_id, about_fact_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS belief_shards_source_idx
  ON public.belief_shards (organization_id, source_type, observed_at DESC);

ALTER TABLE public.belief_shards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view belief shards" ON public.belief_shards;
CREATE POLICY "Members can view belief shards"
  ON public.belief_shards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = belief_shards.organization_id
        AND om.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Service role manages belief shards" ON public.belief_shards;
CREATE POLICY "Service role manages belief shards"
  ON public.belief_shards FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.belief_shards IS
  'Per-entity belief graph edges: holder_entity_id believes about_fact_id as of observed_at unless revoked.';
COMMENT ON COLUMN public.belief_shards.holder_entity_id IS
  'Entity whose perspective owns this belief shard.';
COMMENT ON COLUMN public.belief_shards.about_fact_id IS
  'Memory fact that the holder is allowed to know during perspective-aware recall.';
COMMENT ON COLUMN public.belief_shards.source_type IS
  'How the belief was acquired: direct, told, inferred, or rumor.';

NOTIFY pgrst, 'reload schema';
