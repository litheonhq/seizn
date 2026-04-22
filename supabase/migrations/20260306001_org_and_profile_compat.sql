-- Seizn compatibility patch for mixed Supabase schemas
-- Ensures dashboard/org + profile billing fields exist.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: add Seizn-required columns without disturbing existing app fields.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memory_limit INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS api_calls_limit INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memory_count INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS api_calls_this_month INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_cancelled BOOLEAN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memory_decay_enabled BOOLEAN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memory_decay_days INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS handle TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS e2e_salt TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS e2e_verification_block TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS e2e_setup_at TIMESTAMPTZ;

ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'free';
ALTER TABLE public.profiles ALTER COLUMN memory_limit SET DEFAULT 10000;
ALTER TABLE public.profiles ALTER COLUMN api_calls_limit SET DEFAULT 1000;
ALTER TABLE public.profiles ALTER COLUMN memory_count SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN api_calls_this_month SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN subscription_cancelled SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN memory_decay_enabled SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN memory_decay_days SET DEFAULT 30;
ALTER TABLE public.profiles ALTER COLUMN language SET DEFAULT 'en';

UPDATE public.profiles
SET
  plan = COALESCE(plan, 'free'),
  memory_limit = COALESCE(memory_limit, 10000),
  api_calls_limit = COALESCE(api_calls_limit, 1000),
  memory_count = COALESCE(memory_count, 0),
  api_calls_this_month = COALESCE(api_calls_this_month, 0),
  subscription_cancelled = COALESCE(subscription_cancelled, false),
  memory_decay_enabled = COALESCE(memory_decay_enabled, false),
  memory_decay_days = COALESCE(memory_decay_days, 30),
  full_name = COALESCE(full_name, display_name, preferred_name, handle),
  name = COALESCE(name, full_name, display_name, preferred_name, handle),
  language = COALESCE(language, locale, 'en');

-- ---------------------------------------------------------------------------
-- Organizations core
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  plan VARCHAR(20) NOT NULL DEFAULT 'team',
  subscription_tier VARCHAR(20),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  memory_limit INTEGER NOT NULL DEFAULT 100000,
  api_calls_limit INTEGER NOT NULL DEFAULT 100000,
  data_region TEXT DEFAULT 'global',
  region_locked BOOLEAN DEFAULT false,
  region_changed_at TIMESTAMPTZ,
  default_sso_connection_id UUID,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  invited_by TEXT REFERENCES public.profiles(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  invited_by TEXT REFERENCES public.profiles(id),
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  accepted_by TEXT REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE public.organization_members ALTER COLUMN permissions SET DEFAULT '{}'::jsonb;

ALTER TABLE public.organization_invites ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE public.organization_invites ADD COLUMN IF NOT EXISTS accepted_by TEXT REFERENCES public.profiles(id);
ALTER TABLE public.organization_invites ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON public.organization_members(role);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON public.organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON public.organization_invites(token);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'api_keys'
  ) THEN
    ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_api_keys_org ON public.api_keys(organization_id) WHERE organization_id IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'memories'
  ) THEN
    ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_memories_org ON public.memories(organization_id) WHERE organization_id IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'usage_logs'
  ) THEN
    ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_usage_logs_org ON public.usage_logs(organization_id) WHERE organization_id IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'webhooks'
  ) THEN
    ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_webhooks_org ON public.webhooks(organization_id) WHERE organization_id IS NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RPC compatibility: used by /api/organizations
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_organization(VARCHAR, VARCHAR, TEXT);

CREATE OR REPLACE FUNCTION public.create_organization(
  p_name VARCHAR(100),
  p_slug VARCHAR(50),
  p_owner_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name, slug)
  VALUES (p_name, p_slug)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_org_id, p_owner_id, 'owner', 'active')
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      status = EXCLUDED.status;

  RETURN v_org_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_user_org_role(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_user_org_role(
  p_org_id UUID,
  p_user_id TEXT
)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT role
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = p_user_id
    LIMIT 1
  );
END;
$$;

COMMIT;
