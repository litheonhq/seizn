-- Fix function overloading conflicts
-- PostgREST cannot resolve between uuid and text parameter types
-- Remove the uuid versions that were causing PGRST203 errors

-- Drop conflicting search_memories function (uuid version with search_ef)
DROP FUNCTION IF EXISTS search_memories(
  query_embedding vector,
  match_user_id uuid,
  match_count integer,
  match_threshold double precision,
  match_namespace text,
  search_ef integer
);

-- Drop conflicting hybrid_search_memories function (uuid version with search_ef)
DROP FUNCTION IF EXISTS hybrid_search_memories(
  query_text text,
  query_embedding vector,
  match_user_id uuid,
  match_count integer,
  match_threshold double precision,
  match_namespace text,
  keyword_weight double precision,
  vector_weight double precision,
  search_ef integer
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Note: The text versions remain:
-- - search_memories(query_embedding vector, match_user_id text, ...)
-- - hybrid_search_memories(query_text text, query_embedding vector, match_user_id text, ...)
