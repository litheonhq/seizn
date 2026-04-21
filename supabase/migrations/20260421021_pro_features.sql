-- 20260421021_pro_features.sql
-- Pro-tier feature differentiators: Canon Lock review, post-mortem credits,
-- and Chaos Monkey queue priority.

-- Canon Lock team review (Pro feature)
CREATE TABLE IF NOT EXISTS public.canon_lock_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canon_lock_id UUID NOT NULL REFERENCES public.canon_locks(id) ON DELETE CASCADE,
  studio_id TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canon_lock_reviews_studio_status
  ON public.canon_lock_reviews(studio_id, status, created_at DESC);

ALTER TABLE public.canon_locks
  ADD COLUMN IF NOT EXISTS requires_team_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.canon_lock_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages canon lock reviews" ON public.canon_lock_reviews;
CREATE POLICY "Service role manages canon lock reviews"
  ON public.canon_lock_reviews FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own canon lock reviews" ON public.canon_lock_reviews;
CREATE POLICY "Users can view own canon lock reviews"
  ON public.canon_lock_reviews FOR SELECT
  USING (
    studio_id = auth.uid()::TEXT
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id::TEXT = canon_lock_reviews.studio_id
        AND om.user_id = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.canon_lock_reviews TO authenticated;
GRANT ALL ON public.canon_lock_reviews TO service_role;

-- Post-mortem credit ledger (Pro feature)
CREATE TABLE IF NOT EXISTS public.post_mortem_credits (
  studio_id TEXT NOT NULL,
  quarter DATE NOT NULL,
  credits_granted INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, quarter)
);

ALTER TABLE public.post_mortem_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages post-mortem credits" ON public.post_mortem_credits;
CREATE POLICY "Service role manages post-mortem credits"
  ON public.post_mortem_credits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own post-mortem credits" ON public.post_mortem_credits;
CREATE POLICY "Users can view own post-mortem credits"
  ON public.post_mortem_credits FOR SELECT
  USING (
    studio_id = auth.uid()::TEXT
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id::TEXT = post_mortem_credits.studio_id
        AND om.user_id = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.post_mortem_credits TO authenticated;
GRANT ALL ON public.post_mortem_credits TO service_role;

-- Chaos Monkey priority queue (Pro feature)
ALTER TABLE public.chaos_runs
  ADD COLUMN IF NOT EXISTS queue_priority INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_chaos_runs_status_priority_created
  ON public.chaos_runs(status, queue_priority DESC, created_at ASC)
  WHERE status IN ('queued', 'running');

NOTIFY pgrst, 'reload schema';
