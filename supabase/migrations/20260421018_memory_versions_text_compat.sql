CREATE TABLE IF NOT EXISTS public.memory_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'default',
  version INTEGER NOT NULL DEFAULT 1,
  last_modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, namespace)
);

CREATE INDEX IF NOT EXISTS idx_memory_versions_user_namespace
  ON public.memory_versions(user_id, namespace);

CREATE OR REPLACE FUNCTION public.increment_memory_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user_id TEXT;
  target_namespace TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_user_id := OLD.user_id;
    target_namespace := COALESCE(OLD.namespace, 'default');
  ELSE
    target_user_id := NEW.user_id;
    target_namespace := COALESCE(NEW.namespace, 'default');
  END IF;

  INSERT INTO public.memory_versions (user_id, namespace, version, last_modified_at)
  VALUES (target_user_id, target_namespace, 1, NOW())
  ON CONFLICT (user_id, namespace)
  DO UPDATE SET
    version = public.memory_versions.version + 1,
    last_modified_at = NOW();

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memory_insert_version ON public.memories;
CREATE TRIGGER trg_memory_insert_version
  AFTER INSERT ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_memory_version();

DROP TRIGGER IF EXISTS trg_memory_update_version ON public.memories;
CREATE TRIGGER trg_memory_update_version
  AFTER UPDATE ON public.memories
  FOR EACH ROW
  WHEN (
    OLD.content IS DISTINCT FROM NEW.content
    OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
    OR OLD.importance IS DISTINCT FROM NEW.importance
  )
  EXECUTE FUNCTION public.increment_memory_version();

DROP TRIGGER IF EXISTS trg_memory_delete_version ON public.memories;
CREATE TRIGGER trg_memory_delete_version
  AFTER DELETE ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_memory_version();

CREATE OR REPLACE FUNCTION public.get_memory_version(
  p_user_id TEXT,
  p_namespace TEXT DEFAULT 'default'
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  current_version INTEGER;
BEGIN
  SELECT mv.version INTO current_version
  FROM public.memory_versions mv
  WHERE mv.user_id = p_user_id
    AND mv.namespace = p_namespace;

  RETURN COALESCE(current_version, 0);
END;
$$;

ALTER TABLE public.memory_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memory_versions_user_policy ON public.memory_versions;
DROP POLICY IF EXISTS memory_versions_service_policy ON public.memory_versions;
DROP POLICY IF EXISTS "Users can view own memory versions" ON public.memory_versions;
DROP POLICY IF EXISTS "Service role manages memory versions" ON public.memory_versions;

CREATE POLICY "Users can view own memory versions"
  ON public.memory_versions FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service role manages memory versions"
  ON public.memory_versions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.memory_versions TO authenticated;
GRANT ALL ON public.memory_versions TO service_role;

COMMENT ON TABLE public.memory_versions IS 'Tracks memory modification versions for cache invalidation';
COMMENT ON FUNCTION public.increment_memory_version() IS 'Auto-increments memory_versions on memory table changes';
COMMENT ON FUNCTION public.get_memory_version(TEXT, TEXT) IS 'Gets current memory version for cache key generation';

NOTIFY pgrst, 'reload schema';
