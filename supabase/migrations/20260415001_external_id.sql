-- 20260415001_external_id.sql
-- Adds external_id to graph_entities so SDK clients can use stable studio-chosen slugs
-- (e.g. "blacksmith") instead of server-generated UUIDs.
--
-- Backward compatible: column is nullable. Existing entities have NULL until backfilled
-- by clients. Unique partial index allows multiple NULLs but rejects duplicate non-NULL
-- values within a graph.

ALTER TABLE public.graph_entities
    ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_entities_external_id
    ON public.graph_entities(graph_id, external_id)
    WHERE external_id IS NOT NULL;

COMMENT ON COLUMN public.graph_entities.external_id IS
    'Optional stable identifier chosen by the client (e.g. SDK slug). Unique per graph when set.';

-- Reload PostgREST schema cache so the new column is queryable via REST immediately.
NOTIFY pgrst, 'reload schema';
