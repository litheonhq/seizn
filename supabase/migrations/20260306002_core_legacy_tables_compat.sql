-- Seizn compatibility patch for missing core legacy tables

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_id UUID,
  name TEXT NOT NULL,
  key_hash TEXT,
  key_prefix TEXT,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['memory:read', 'memory:write']::text[],
  scope_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_restriction TEXT[],
  rate_limit_override INTEGER,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON public.api_keys(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON public.api_keys(org_id) WHERE org_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  encrypted_content TEXT,
  is_encrypted BOOLEAN NOT NULL DEFAULT false,
  embedding VECTOR(1024),
  memory_type TEXT NOT NULL DEFAULT 'fact',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  namespace TEXT NOT NULL DEFAULT 'default',
  companion_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  scope TEXT NOT NULL DEFAULT 'user',
  source TEXT,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  importance INTEGER NOT NULL DEFAULT 5,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  utility_score DOUBLE PRECISION,
  content_hash TEXT,
  note_type TEXT,
  salience DOUBLE PRECISION,
  merged_into UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON public.memories(user_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_memories_org ON public.memories(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_scope ON public.memories(user_id, scope) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_memories_namespace ON public.memories(user_id, namespace) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_memories_tags ON public.memories USING GIN(tags) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_memories_type ON public.memories(user_id, memory_type) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON public.memories(user_id, namespace, content_hash) WHERE content_hash IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_memories_user_namespace_content_hash'
  ) THEN
    ALTER TABLE public.memories
      ADD CONSTRAINT uq_memories_user_namespace_content_hash
      UNIQUE (user_id, namespace, content_hash);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  status TEXT,
  error_type TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  embedding_tokens INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  request_body JSONB,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_org ON public.usage_logs(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON public.usage_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  namespace TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON public.webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_org ON public.webhooks(organization_id) WHERE organization_id IS NOT NULL;

COMMIT;
