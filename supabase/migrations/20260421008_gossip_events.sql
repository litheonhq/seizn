-- 20260421008_gossip_events.sql
-- Rumor propagation events with deterministic distortion metadata.

CREATE TABLE IF NOT EXISTS public.gossip_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',
  source_belief_id TEXT,
  fact_original TEXT NOT NULL,
  fact_transmitted TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'dialogue',
  distortion_model TEXT NOT NULL DEFAULT 'word_swap'
    CHECK (distortion_model IN ('none', 'word_swap', 'entity_swap', 'word_and_entity_swap', 'custom')),
  distortion_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence REAL NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  propagated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gossip_events_user_namespace_idx
  ON public.gossip_events (user_id, namespace, propagated_at DESC);

CREATE INDEX IF NOT EXISTS gossip_events_entities_idx
  ON public.gossip_events (from_entity_id, to_entity_id, propagated_at DESC);

ALTER TABLE public.gossip_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages gossip events" ON public.gossip_events;
CREATE POLICY "Service role manages gossip events"
  ON public.gossip_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.gossip_events IS
  'Records how beliefs or facts mutate as they travel between entities.';
COMMENT ON COLUMN public.gossip_events.source_belief_id IS
  'Optional external belief shard identifier; stored as text so this table can ship before belief_shards is merged.';

NOTIFY pgrst, 'reload schema';
