-- Seizn's canonical NPC table is `graph_entities` with `type = 'person'`,
-- created by 20260114003_003_graph_rag.sql. This batch's seeded NPC maps
-- to a graph_entities row. Verified 2026-04-22: there is no `characters` table.

ALTER TABLE public.graph_entities
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_graph_entities_synthetic
  ON public.graph_entities(user_id, is_synthetic)
  WHERE is_synthetic = TRUE;

COMMENT ON COLUMN public.graph_entities.is_synthetic IS
  'TRUE when the entity (NPC) was auto-seeded from a third-party dataset (e.g., Nemotron-Personas-Korea). UI surfaces a badge so writers can distinguish from hand-crafted entities.';
COMMENT ON COLUMN public.graph_entities.provenance IS
  'Attribution metadata required by upstream dataset license. Schema: { source, source_uuid, source_license, source_license_url, source_attribution, source_dataset_url, seeded_at }.';

NOTIFY pgrst, 'reload schema';
