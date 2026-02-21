-- Content Hash Dedup Safety Net
-- Adds content_hash column + unique index to prevent duplicate memories
-- even when concurrent inserts bypass the embedding-based dedup check.

ALTER TABLE memories ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Unique index scoped to (user_id, namespace, content_hash) for active memories only.
-- NULL content_hash rows are excluded so old rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_content_hash
  ON memories(user_id, namespace, content_hash)
  WHERE NOT is_deleted AND content_hash IS NOT NULL;

-- Backfill existing rows (optional, can be run separately for large tables)
-- UPDATE memories SET content_hash = encode(sha256(convert_to(content, 'UTF8')), 'hex')
-- WHERE content_hash IS NULL AND NOT is_deleted AND content != '[encrypted]';
