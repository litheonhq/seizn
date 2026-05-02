-- Seizn Author Memory v3 - project-scoped replay side effects
-- Prevents identical replay request keys from colliding across Author projects.

UPDATE author_memory_v3_side_effects
SET project_id = '__legacy_unscoped__'
WHERE project_id IS NULL;

ALTER TABLE author_memory_v3_side_effects
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE author_memory_v3_side_effects
  DROP CONSTRAINT IF EXISTS author_memory_v3_side_effects_pkey;

ALTER TABLE author_memory_v3_side_effects
  ADD CONSTRAINT author_memory_v3_side_effects_pkey
  PRIMARY KEY (user_id, project_id, key);

DROP INDEX IF EXISTS idx_author_memory_v3_side_effects_project;

CREATE INDEX IF NOT EXISTS idx_author_memory_v3_side_effects_project
ON author_memory_v3_side_effects(user_id, project_id, captured_at DESC);
