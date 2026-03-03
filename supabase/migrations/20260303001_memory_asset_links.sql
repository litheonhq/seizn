-- Link binary assets (spring_assets) to core memories.
-- Keeps memory content table text-first while supporting image attachments.

CREATE TABLE IF NOT EXISTS memory_asset_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES spring_assets(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'attachment' CHECK (relation IN ('attachment', 'source', 'reference', 'derived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(memory_id, asset_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_memory_asset_links_memory ON memory_asset_links(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_asset_links_asset ON memory_asset_links(asset_id);

ALTER TABLE memory_asset_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own memory asset links" ON memory_asset_links;
CREATE POLICY "Users can view own memory asset links"
  ON memory_asset_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM memories m
      WHERE m.id = memory_asset_links.memory_id
        AND m.user_id = auth.uid()::TEXT
    )
    AND EXISTS (
      SELECT 1
      FROM spring_assets a
      WHERE a.id = memory_asset_links.asset_id
        AND a.user_id = auth.uid()::TEXT
    )
  );

DROP POLICY IF EXISTS "Users can insert own memory asset links" ON memory_asset_links;
CREATE POLICY "Users can insert own memory asset links"
  ON memory_asset_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM memories m
      WHERE m.id = memory_asset_links.memory_id
        AND m.user_id = auth.uid()::TEXT
    )
    AND EXISTS (
      SELECT 1
      FROM spring_assets a
      WHERE a.id = memory_asset_links.asset_id
        AND a.user_id = auth.uid()::TEXT
    )
  );

DROP POLICY IF EXISTS "Users can delete own memory asset links" ON memory_asset_links;
CREATE POLICY "Users can delete own memory asset links"
  ON memory_asset_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM memories m
      WHERE m.id = memory_asset_links.memory_id
        AND m.user_id = auth.uid()::TEXT
    )
    AND EXISTS (
      SELECT 1
      FROM spring_assets a
      WHERE a.id = memory_asset_links.asset_id
        AND a.user_id = auth.uid()::TEXT
    )
  );
