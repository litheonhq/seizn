-- 20260421010_usage_meters.sql
-- Usage ledger and monthly rollups for Stripe metered overage billing.

CREATE TABLE IF NOT EXISTS public.usage_events (
  id BIGSERIAL PRIMARY KEY,
  studio_id TEXT NOT NULL,
  user_id TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  dimension TEXT NOT NULL CHECK (dimension IN ('memories', 'ops')),
  quantity BIGINT NOT NULL CHECK (quantity > 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT UNIQUE,
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS usage_events_studio_occurred_idx
  ON public.usage_events (studio_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS usage_events_dimension_occurred_idx
  ON public.usage_events (dimension, occurred_at DESC);

CREATE INDEX IF NOT EXISTS usage_events_customer_idx
  ON public.usage_events (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.usage_aggregates_monthly (
  studio_id TEXT NOT NULL,
  cycle_start DATE NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('memories', 'ops')),
  total_quantity BIGINT NOT NULL DEFAULT 0,
  stripe_reported_quantity BIGINT NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  last_event_at TIMESTAMPTZ,
  last_flushed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, cycle_start, dimension)
);

CREATE INDEX IF NOT EXISTS usage_aggregates_monthly_customer_idx
  ON public.usage_aggregates_monthly (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS usage_aggregates_monthly_plan_idx
  ON public.usage_aggregates_monthly (plan, cycle_start);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_aggregates_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages usage events" ON public.usage_events;
CREATE POLICY "Service role manages usage events"
  ON public.usage_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own usage events" ON public.usage_events;
CREATE POLICY "Users can view own usage events"
  ON public.usage_events FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR studio_id = auth.uid()::text
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = usage_events.organization_id
          AND om.user_id::text = auth.uid()::text
      )
    )
  );

DROP POLICY IF EXISTS "Service role manages usage aggregates" ON public.usage_aggregates_monthly;
CREATE POLICY "Service role manages usage aggregates"
  ON public.usage_aggregates_monthly FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own usage aggregates" ON public.usage_aggregates_monthly;
CREATE POLICY "Users can view own usage aggregates"
  ON public.usage_aggregates_monthly FOR SELECT
  USING (
    studio_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()::text
        AND (
          p.id = usage_aggregates_monthly.studio_id
          OR p.stripe_customer_id = usage_aggregates_monthly.studio_id
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = usage_aggregates_monthly.studio_id
        AND om.user_id::text = auth.uid()::text
    )
  );

CREATE OR REPLACE FUNCTION public.record_usage_event(
  p_studio_id TEXT,
  p_dimension TEXT,
  p_quantity BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL,
  p_stripe_customer_id TEXT DEFAULT NULL,
  p_subscription_id TEXT DEFAULT NULL,
  p_plan TEXT DEFAULT 'free',
  p_source TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(inserted BOOLEAN, event_id BIGINT, cycle_start DATE, aggregate_total BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id BIGINT;
  v_occurred_at TIMESTAMPTZ;
  v_cycle_start DATE;
  v_total BIGINT;
BEGIN
  IF p_studio_id IS NULL OR length(trim(p_studio_id)) = 0 THEN
    RAISE EXCEPTION 'studio_id is required';
  END IF;

  IF p_dimension NOT IN ('memories', 'ops') THEN
    RAISE EXCEPTION 'dimension must be memories or ops';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;

  INSERT INTO public.usage_events (
    studio_id,
    user_id,
    organization_id,
    stripe_customer_id,
    subscription_id,
    plan,
    dimension,
    quantity,
    idempotency_key,
    source,
    metadata
  )
  VALUES (
    p_studio_id,
    p_user_id,
    p_organization_id,
    p_stripe_customer_id,
    p_subscription_id,
    COALESCE(NULLIF(p_plan, ''), 'free'),
    p_dimension,
    p_quantity,
    p_idempotency_key,
    p_source,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id, occurred_at INTO v_event_id, v_occurred_at;

  IF v_event_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::BIGINT, NULL::DATE, NULL::BIGINT;
    RETURN;
  END IF;

  v_cycle_start := date_trunc('month', v_occurred_at)::date;

  INSERT INTO public.usage_aggregates_monthly (
    studio_id,
    cycle_start,
    dimension,
    total_quantity,
    stripe_customer_id,
    subscription_id,
    plan,
    last_event_at,
    updated_at
  )
  VALUES (
    p_studio_id,
    v_cycle_start,
    p_dimension,
    p_quantity,
    p_stripe_customer_id,
    p_subscription_id,
    COALESCE(NULLIF(p_plan, ''), 'free'),
    v_occurred_at,
    now()
  )
  ON CONFLICT (studio_id, cycle_start, dimension) DO UPDATE
  SET
    total_quantity = public.usage_aggregates_monthly.total_quantity + EXCLUDED.total_quantity,
    stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, public.usage_aggregates_monthly.stripe_customer_id),
    subscription_id = COALESCE(EXCLUDED.subscription_id, public.usage_aggregates_monthly.subscription_id),
    plan = COALESCE(NULLIF(EXCLUDED.plan, ''), public.usage_aggregates_monthly.plan),
    last_event_at = GREATEST(
      COALESCE(public.usage_aggregates_monthly.last_event_at, EXCLUDED.last_event_at),
      EXCLUDED.last_event_at
    ),
    updated_at = now()
  RETURNING total_quantity INTO v_total;

  RETURN QUERY SELECT true, v_event_id, v_cycle_start, v_total;
END;
$$;

COMMENT ON TABLE public.usage_events IS
  'Append-only usage ledger for billable memory writes and operations. Stripe reporting is derived from monthly aggregates.';
COMMENT ON TABLE public.usage_aggregates_monthly IS
  'Per-studio monthly usage totals and the quantity already reported to Stripe metered billing.';
COMMENT ON FUNCTION public.record_usage_event IS
  'Idempotently records one usage event and increments the matching monthly aggregate.';

NOTIFY pgrst, 'reload schema';
