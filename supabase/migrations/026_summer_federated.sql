-- Seizn Summer - Federated Retrieval (Bring-your-own-store)
-- Migration: 026_summer_federated.sql

-- ===========================================
-- 1) Federated sources (connectors)
-- ===========================================
CREATE TABLE IF NOT EXISTS summer_federated_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  provider TEXT NOT NULL, -- supabase|pinecone|weaviate|azure_ai_search|vespa|custom
  config_encrypted TEXT NOT NULL, -- encrypted JSON

  capabilities JSONB NOT NULL DEFAULT '{}'::JSONB, -- e.g. {vector:true, keyword:true, hybrid:false}
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summer_federated_sources_user
ON summer_federated_sources(user_id, updated_at DESC);

-- ===========================================
-- 2) Bindings: map a Seizn collection -> federated source target
-- ===========================================
CREATE TABLE IF NOT EXISTS summer_federated_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES summer_federated_sources(id) ON DELETE CASCADE,

  remote_collection TEXT NOT NULL, -- index/namespace/collection name in remote
  policy JSONB NOT NULL DEFAULT '{}'::JSONB, -- permissions, filters, routing hints

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summer_federated_bindings_collection
ON summer_federated_bindings(collection_id, created_at DESC);

-- ===========================================
-- 3) RLS
-- ===========================================
ALTER TABLE summer_federated_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE summer_federated_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own summer_federated_sources"
  ON summer_federated_sources FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own summer_federated_sources"
  ON summer_federated_sources FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own summer_federated_sources"
  ON summer_federated_sources FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view own summer_federated_bindings"
  ON summer_federated_bindings FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own summer_federated_bindings"
  ON summer_federated_bindings FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own summer_federated_bindings"
  ON summer_federated_bindings FOR UPDATE
  USING (auth.uid()::TEXT = user_id);
