-- Seizn Supabase lint hardening
-- Fixes live-schema drift reported by Supabase Database Linter:
-- - public.graph_entities RLS disabled
-- - SECURITY DEFINER functions executable by anon/authenticated
-- - vector/pg_trgm extensions installed in public
-- - update_relay_agents_updated_at mutable search_path
-- - story_health_daily exposed through PostgREST roles

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END $$;

SET search_path = public, extensions, pg_temp;

ALTER TABLE IF EXISTS public.knowledge_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.graph_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.graph_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.graph_extraction_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.graph_entities') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'graph_entities'
        AND policyname = 'org_read_graph_entities'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY "org_read_graph_entities" ON public.graph_entities
          FOR SELECT USING (
            graph_id IN (
              SELECT id FROM public.knowledge_graphs
              WHERE organization_id IN (
                SELECT organization_id FROM public.organization_members
                WHERE user_id = auth.uid()::TEXT
              )
            )
          )
      $policy$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'graph_entities'
        AND policyname = 'org_manage_graph_entities'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY "org_manage_graph_entities" ON public.graph_entities
          FOR ALL USING (
            graph_id IN (
              SELECT id FROM public.knowledge_graphs
              WHERE organization_id IN (
                SELECT organization_id FROM public.organization_members
                WHERE user_id = auth.uid()::TEXT
                  AND role IN ('owner', 'admin', 'developer')
              )
            )
          )
      $policy$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'graph_entities'
        AND policyname = 'service_all_graph_entities'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY "service_all_graph_entities" ON public.graph_entities
          FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role')
          WITH CHECK ((auth.jwt() ->> 'role')::TEXT = 'service_role')
      $policy$;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.update_relay_agents_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.update_relay_agents_updated_at() SET search_path = public, pg_temp';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.story_health_daily') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE public.story_health_daily FROM PUBLIC;
    REVOKE ALL PRIVILEGES ON TABLE public.story_health_daily FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public.story_health_daily FROM authenticated;
    GRANT SELECT ON TABLE public.story_health_daily TO service_role;
  END IF;
END $$;

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS regproc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC', fn.regproc);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM anon', fn.regproc);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM authenticated', fn.regproc);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.regproc);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_author_audit_event_type_trgm
ON public.author_audit_log USING GIN (event_type gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_author_audit_payload_text_trgm
ON public.author_audit_log USING GIN ((payload::TEXT) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_author_audit_log(
  p_user_id TEXT,
  p_project_id TEXT DEFAULT NULL,
  p_event_types TEXT[] DEFAULT NULL,
  p_decision_id UUID DEFAULT NULL,
  p_q TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF public.author_audit_log
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT *
  FROM public.author_audit_log
  WHERE user_id = p_user_id
    AND (p_project_id IS NULL OR project_id = p_project_id)
    AND (p_event_types IS NULL OR event_type = ANY(p_event_types))
    AND (p_decision_id IS NULL OR decision_id = p_decision_id)
    AND (p_since IS NULL OR created_at >= p_since)
    AND (p_until IS NULL OR created_at <= p_until)
    AND (
      COALESCE(NULLIF(BTRIM(p_q), ''), NULL) IS NULL
      OR event_type ILIKE ('%' || p_q || '%')
      OR decision_id::TEXT ILIKE ('%' || p_q || '%')
      OR COALESCE(parent_decision_id::TEXT, '') ILIKE ('%' || p_q || '%')
      OR payload::TEXT ILIKE ('%' || p_q || '%')
      OR COALESCE(llm_meta::TEXT, '') ILIKE ('%' || p_q || '%')
    )
  ORDER BY created_at DESC, id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.search_author_audit_log(
  TEXT, TEXT, TEXT[], UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.search_author_audit_log(
  TEXT, TEXT, TEXT[], UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) TO service_role;
