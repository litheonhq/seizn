-- Fix trigger function search_path compatibility.
-- When search_path is empty, unqualified table names fail.
-- Use explicit schema-qualified references for memory_content_history.

CREATE OR REPLACE FUNCTION public.save_memory_content_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content
    OR OLD.memory_type IS DISTINCT FROM NEW.memory_type
    OR OLD.tags IS DISTINCT FROM NEW.tags
    OR OLD.importance IS DISTINCT FROM NEW.importance THEN

    INSERT INTO public.memory_content_history (
      memory_id,
      content,
      memory_type,
      tags,
      importance,
      version,
      changed_by
    )
    VALUES (
      OLD.id,
      OLD.content,
      OLD.memory_type,
      OLD.tags,
      OLD.importance,
      COALESCE(
        (
          SELECT MAX(version) + 1
          FROM public.memory_content_history
          WHERE memory_id = OLD.id
        ),
        1
      ),
      'system'
    );
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
