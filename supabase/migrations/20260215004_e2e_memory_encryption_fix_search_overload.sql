-- Migration: 20260215_e2e_memory_encryption_fix_search_overload.sql
-- Description: Ensure ALL search RPC overloads exclude encrypted memories.
--
-- Context:
-- `public.search_memories` exists in multiple overloaded signatures on the remote DB.
-- We already excluded encrypted memories for the (match_user_id TEXT) signature in
-- 20260215_e2e_memory_encryption.sql, but the (match_user_id UUID) overload must
-- also exclude `is_encrypted=true` rows to guarantee encrypted memories never leak
-- into any server-side search results.

CREATE OR REPLACE FUNCTION public.search_memories(
  query_embedding vector,
  match_user_id uuid,
  match_count integer DEFAULT 10,
  match_threshold double precision DEFAULT 0.7,
  match_namespace text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  content text,
  memory_type text,
  tags text[],
  namespace text,
  similarity double precision
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.tags,
    m.namespace,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.memories m
  WHERE m.user_id = match_user_id
    AND NOT m.is_deleted
    AND NOT m.is_encrypted
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
    AND (match_namespace IS NULL OR m.namespace = match_namespace)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

-- Notify PostgREST to reload schema cache (helps Supabase clients pick up changed RPC definitions)
NOTIFY pgrst, 'reload schema';

