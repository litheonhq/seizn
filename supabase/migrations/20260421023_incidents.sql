-- Migration: 20260421023_incidents.sql
-- Description: Public incident ledger for the localized status page.

CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  status TEXT NOT NULL DEFAULT 'investigating'
    CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  title TEXT NOT NULL,
  summary TEXT,
  affected_components TEXT[] DEFAULT '{}',
  public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_started
  ON public.incidents(started_at DESC)
  WHERE public = TRUE;

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public incidents are readable" ON public.incidents;
CREATE POLICY "Public incidents are readable"
  ON public.incidents FOR SELECT
  USING (public = TRUE);

DROP POLICY IF EXISTS "Service role manages incidents" ON public.incidents;
CREATE POLICY "Service role manages incidents"
  ON public.incidents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.incidents TO anon, authenticated;
GRANT ALL ON public.incidents TO service_role;

NOTIFY pgrst, 'reload schema';
