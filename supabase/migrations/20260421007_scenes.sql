-- 20260421007_scenes.sql
-- Bounded scene context for recall-time memory boosts.

CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',
  entity_ids TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  summary TEXT,
  outcomes JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (array_length(entity_ids, 1) IS NULL OR array_length(entity_ids, 1) <= 100),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS scenes_user_active_idx
  ON public.scenes (user_id, namespace, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS scenes_entity_ids_gin_idx
  ON public.scenes USING gin (entity_ids);

ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages scenes" ON public.scenes;
CREATE POLICY "Service role manages scenes"
  ON public.scenes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.scenes IS
  'Active and completed bounded context windows used to boost in-scene memory recall.';
COMMENT ON COLUMN public.scenes.entity_ids IS
  'NPC, player, faction, location, or object identifiers currently in the scene.';

NOTIFY pgrst, 'reload schema';
