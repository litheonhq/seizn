-- 20260421009_memory_branches.sql
-- Lightweight branch/diff primitives for designer save-state experimentation.

CREATE TABLE IF NOT EXISTS public.memory_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  parent_branch_id UUID REFERENCES public.memory_branches(id) ON DELETE SET NULL,
  base_snapshot_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, namespace, name)
);

CREATE TABLE IF NOT EXISTS public.memory_branch_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.memory_branches(id) ON DELETE CASCADE,
  memory_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('added', 'updated', 'deleted')),
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS memory_branches_one_active_idx
  ON public.memory_branches (user_id, namespace)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS memory_branches_user_namespace_idx
  ON public.memory_branches (user_id, namespace, updated_at DESC);

CREATE INDEX IF NOT EXISTS memory_branch_entries_branch_memory_idx
  ON public.memory_branch_entries (branch_id, memory_id, created_at DESC);

ALTER TABLE public.memory_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_branch_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages memory branches" ON public.memory_branches;
CREATE POLICY "Service role manages memory branches"
  ON public.memory_branches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages memory branch entries" ON public.memory_branch_entries;
CREATE POLICY "Service role manages memory branch entries"
  ON public.memory_branch_entries FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.memory_branches IS
  'Git-like branch heads for memory graph experiments; merge returns a caller-resolved diff.';
COMMENT ON TABLE public.memory_branch_entries IS
  'Per-branch memory mutations. Latest entry per memory_id is used for diff generation.';

NOTIFY pgrst, 'reload schema';
