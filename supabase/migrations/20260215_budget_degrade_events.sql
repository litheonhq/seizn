-- Seizn - Budget Degrade Events
-- Migration: 20260215_budget_degrade_events.sql
--
-- Stores "budget protection" events when retrieval config is degraded due to budget limits.
-- The dashboard reads from this table via /api/budget/degrade-events.

CREATE TABLE IF NOT EXISTS budget_degrade_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  reason TEXT NOT NULL,
  original_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  degraded_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  cost_saved_usd DOUBLE PRECISION NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_degrade_events_user_created
  ON budget_degrade_events(user_id, created_at DESC);

ALTER TABLE budget_degrade_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own budget_degrade_events" ON budget_degrade_events;
CREATE POLICY "Users can view own budget_degrade_events"
  ON budget_degrade_events FOR SELECT
  USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "Users can insert own budget_degrade_events" ON budget_degrade_events;
CREATE POLICY "Users can insert own budget_degrade_events"
  ON budget_degrade_events FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

