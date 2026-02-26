-- Seizn - Flight Recorder Traces Compatibility View (with cost_usd)
-- Migration: 20260215_flight_recorder_traces_cost_usd_view.sql
--
-- Adds a derived `cost_usd` column so dashboard analytics can query cost without
-- fetching/parsing the full JSON trace client-side.

CREATE OR REPLACE VIEW flight_recorder_traces AS
SELECT
  t.*,
  COALESCE(NULLIF((t.trace->'cost'->>'total'), '')::DOUBLE PRECISION, 0) AS cost_usd
FROM fall_retrieval_traces t;

GRANT SELECT ON flight_recorder_traces TO authenticated;

