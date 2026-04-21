-- 20260421017_post_mortem_reports.sql
-- Token-gated post-mortem report jobs and generated PDF artifacts.

CREATE TABLE IF NOT EXISTS public.post_mortem_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  public_token TEXT NOT NULL UNIQUE,
  report_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  executive_summary TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  recommendations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  story_chart_png_base64 TEXT,
  pdf_storage_path TEXT,
  pdf_size_bytes INTEGER NOT NULL DEFAULT 0,
  notify_email TEXT,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_mortem_reports_studio_created
  ON public.post_mortem_reports(studio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_mortem_reports_status_created
  ON public.post_mortem_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_mortem_reports_public_token
  ON public.post_mortem_reports(public_token);

ALTER TABLE public.post_mortem_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages post mortem reports" ON public.post_mortem_reports;
CREATE POLICY "Service role manages post mortem reports"
  ON public.post_mortem_reports FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Org members can view post mortem reports" ON public.post_mortem_reports;
CREATE POLICY "Org members can view post mortem reports"
  ON public.post_mortem_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = post_mortem_reports.studio_id
        AND om.user_id = auth.uid()::TEXT
    )
  );

GRANT SELECT ON public.post_mortem_reports TO authenticated;
GRANT ALL ON public.post_mortem_reports TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-mortems',
  'post-mortems',
  FALSE,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.post_mortem_reports IS
  'Generated shipped-title post-mortem reports with token-gated live pages and private PDF artifacts.';

NOTIFY pgrst, 'reload schema';
