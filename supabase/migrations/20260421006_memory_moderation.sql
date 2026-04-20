-- 20260421006_memory_moderation.sql
-- Recall-time and write-time moderation policies for persistent memories.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS moderation_scores JSONB;

ALTER TABLE public.memories
  DROP CONSTRAINT IF EXISTS memories_moderation_status_check;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_moderation_status_check
  CHECK (moderation_status IN ('clean', 'flagged', 'redacted', 'blocked'));

CREATE TABLE IF NOT EXISTS public.moderation_policies (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL,
  memory_class TEXT NOT NULL DEFAULT '*',
  category TEXT NOT NULL CHECK (category IN ('sexual', 'violence', 'pii', 'hate', 'self_harm', 'csam')),
  action TEXT NOT NULL CHECK (action IN ('block', 'redact', 'flag')),
  threshold REAL NOT NULL CHECK (threshold >= 0 AND threshold <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, policy_name, memory_class, category)
);

CREATE INDEX IF NOT EXISTS moderation_policies_org_class_idx
  ON public.moderation_policies (organization_id, memory_class, category);

CREATE INDEX IF NOT EXISTS memories_moderation_status_idx
  ON public.memories (organization_id, moderation_status)
  WHERE is_deleted = false;

ALTER TABLE public.moderation_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view moderation policies" ON public.moderation_policies;
CREATE POLICY "Members can view moderation policies"
  ON public.moderation_policies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = moderation_policies.organization_id
        AND om.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Service role manages moderation policies" ON public.moderation_policies;
CREATE POLICY "Service role manages moderation policies"
  ON public.moderation_policies FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.moderation_policies IS
  'Per-organization memory moderation policy thresholds by category and memory class.';
COMMENT ON COLUMN public.memories.moderation_status IS
  'Moderation outcome for persisted memory content.';
COMMENT ON COLUMN public.memories.moderation_scores IS
  'Provider category scores captured at write time.';

NOTIFY pgrst, 'reload schema';
