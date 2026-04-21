CREATE TABLE IF NOT EXISTS public.canon_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  npc_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('never_say', 'always_say', 'must_not_know', 'must_know')),
  statement TEXT NOT NULL,
  regex_fastpath TEXT,
  severity TEXT NOT NULL DEFAULT 'hard' CHECK (severity IN ('hard', 'soft')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canon_locks_studio_npc_active
  ON public.canon_locks(studio_id, npc_id)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_canon_locks_studio_created
  ON public.canon_locks(studio_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.canon_violations (
  id BIGSERIAL PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lock_id UUID REFERENCES public.canon_locks(id) ON DELETE SET NULL,
  memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL,
  session_id TEXT,
  npc_id TEXT,
  attempted_content TEXT NOT NULL,
  verdict JSONB NOT NULL DEFAULT '{}'::JSONB,
  severity TEXT NOT NULL DEFAULT 'hard' CHECK (severity IN ('hard', 'soft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canon_violations_studio_created
  ON public.canon_violations(studio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canon_violations_lock_created
  ON public.canon_violations(lock_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canon_violations_npc_created
  ON public.canon_violations(studio_id, npc_id, created_at DESC)
  WHERE npc_id IS NOT NULL;

ALTER TABLE public.canon_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canon_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages canon locks" ON public.canon_locks;
CREATE POLICY "Service role manages canon locks"
  ON public.canon_locks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view canon locks" ON public.canon_locks;
CREATE POLICY "Org members can view canon locks"
  ON public.canon_locks FOR SELECT
  USING (
    studio_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id::TEXT = auth.uid()::TEXT
    )
  );

DROP POLICY IF EXISTS "Service role manages canon violations" ON public.canon_violations;
CREATE POLICY "Service role manages canon violations"
  ON public.canon_violations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view canon violations" ON public.canon_violations;
CREATE POLICY "Org members can view canon violations"
  ON public.canon_violations FOR SELECT
  USING (
    studio_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id::TEXT = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.canon_locks TO authenticated;
GRANT SELECT ON public.canon_violations TO authenticated;
GRANT ALL ON public.canon_locks TO service_role;
GRANT ALL ON public.canon_violations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.canon_violations_id_seq TO service_role;
