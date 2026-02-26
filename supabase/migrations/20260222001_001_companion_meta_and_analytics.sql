-- Companion feedback metadata and analytics RPCs
-- 1) Add companion_meta JSONB column to memories
-- 2) Add indexes for common companion filters
-- 3) Add analytics SQL functions used by /api/memories/analytics

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS companion_meta JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_companion_meta
ON memories USING GIN (companion_meta)
WHERE companion_meta IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_cm_subtype
ON memories ((companion_meta->>'character_subtype'))
WHERE companion_meta IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_cm_nsfw
ON memories ((companion_meta->>'nsfw_level'))
WHERE companion_meta IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_cm_scenario
ON memories ((companion_meta->>'scenario'))
WHERE companion_meta IS NOT NULL;

CREATE OR REPLACE FUNCTION companion_analytics(
  p_since timestamptz,
  p_group_by text
)
RETURNS TABLE (
  group_key text,
  session_count bigint,
  avg_satisfaction double precision,
  avg_retry double precision,
  dropout_pct double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    memories.companion_meta->>p_group_by AS group_key,
    COUNT(*) AS session_count,
    AVG(
      CASE
        WHEN (memories.companion_meta->>'satisfaction_score') ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (memories.companion_meta->>'satisfaction_score')::double precision
      END
    ) AS avg_satisfaction,
    AVG(
      CASE
        WHEN (memories.companion_meta->>'retry_count') ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (memories.companion_meta->>'retry_count')::double precision
      END
    ) AS avg_retry,
    ROUND(
      100.0 * COUNT(*) FILTER (
        WHERE LOWER(COALESCE(memories.companion_meta->>'session_ended_naturally', '')) IN ('false', 'f', '0', 'no')
      ) / NULLIF(COUNT(*), 0),
      1
    ) AS dropout_pct
  FROM memories
  WHERE memories.companion_meta IS NOT NULL
    AND memories.is_deleted = FALSE
    AND memories.created_at >= p_since
  GROUP BY memories.companion_meta->>p_group_by
  ORDER BY session_count DESC;
$$;

CREATE OR REPLACE FUNCTION companion_top_scenarios(
  p_since timestamptz,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  scenario text,
  language text,
  cnt bigint,
  avg_satisfaction double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    memories.companion_meta->>'scenario' AS scenario,
    memories.companion_meta->>'language' AS language,
    COUNT(*) AS cnt,
    AVG(
      CASE
        WHEN (memories.companion_meta->>'satisfaction_score') ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (memories.companion_meta->>'satisfaction_score')::double precision
      END
    ) AS avg_satisfaction
  FROM memories
  WHERE memories.companion_meta IS NOT NULL
    AND memories.companion_meta->>'scenario' IS NOT NULL
    AND memories.is_deleted = FALSE
    AND memories.created_at >= p_since
  GROUP BY
    memories.companion_meta->>'scenario',
    memories.companion_meta->>'language'
  ORDER BY cnt DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION companion_unhappy_combos(
  p_since timestamptz
)
RETURNS TABLE (
  subtype text,
  nsfw_level text,
  scenario text,
  avg_retries double precision,
  sessions bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    memories.companion_meta->>'character_subtype' AS subtype,
    memories.companion_meta->>'nsfw_level' AS nsfw_level,
    memories.companion_meta->>'scenario' AS scenario,
    AVG(
      CASE
        WHEN (memories.companion_meta->>'retry_count') ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (memories.companion_meta->>'retry_count')::double precision
      END
    ) AS avg_retries,
    COUNT(*) AS sessions
  FROM memories
  WHERE memories.companion_meta IS NOT NULL
    AND memories.is_deleted = FALSE
    AND memories.created_at >= p_since
    AND (
      CASE
        WHEN (memories.companion_meta->>'retry_count') ~ '^-?[0-9]+$'
          THEN (memories.companion_meta->>'retry_count')::int
        ELSE 0
      END
    ) >= 2
  GROUP BY
    memories.companion_meta->>'character_subtype',
    memories.companion_meta->>'nsfw_level',
    memories.companion_meta->>'scenario'
  ORDER BY avg_retries DESC;
$$;
