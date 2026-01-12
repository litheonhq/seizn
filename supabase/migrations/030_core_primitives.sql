-- Seizn Core Primitives Schema
-- Migration: 030_core_primitives.sql
--
-- Shared infrastructure for all seasons:
-- 1. Organizations & Projects
-- 2. Usage tracking
-- 3. Policy management (extended)

-- ===========================================
-- 1. Organizations
-- ===========================================

CREATE TABLE IF NOT EXISTS core_organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_organizations_slug
ON core_organizations(slug);

-- ===========================================
-- 2. Projects
-- ===========================================

CREATE TABLE IF NOT EXISTS core_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_core_projects_org
ON core_projects(organization_id, created_at DESC);

-- ===========================================
-- 3. Environments
-- ===========================================

CREATE TABLE IF NOT EXISTS core_environments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES core_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'development', -- production, staging, development
  api_key_prefix TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, type)
);

CREATE INDEX IF NOT EXISTS idx_core_environments_project
ON core_environments(project_id);

-- ===========================================
-- 4. Organization Members
-- ===========================================

CREATE TABLE IF NOT EXISTS core_organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core_organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- owner, admin, member, viewer
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_core_org_members_user
ON core_organization_members(user_id);

-- ===========================================
-- 5. Usage Records
-- ===========================================

CREATE TABLE IF NOT EXISTS core_usage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES core_organizations(id) ON DELETE SET NULL,
  project_id UUID REFERENCES core_projects(id) ON DELETE SET NULL,
  environment_id UUID REFERENCES core_environments(id) ON DELETE SET NULL,

  unit TEXT NOT NULL, -- api_call, embedding_token, search_query, rerank_document, storage_mb, memory_operation, eval_run
  quantity INT NOT NULL DEFAULT 1,
  cost_credits DOUBLE PRECISION NOT NULL DEFAULT 0,

  season TEXT NOT NULL, -- spring, summer, fall, winter
  operation TEXT NOT NULL,

  trace_id TEXT,
  request_id TEXT,

  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for usage queries
CREATE INDEX IF NOT EXISTS idx_core_usage_user_time
ON core_usage_records(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_core_usage_org_time
ON core_usage_records(organization_id, created_at DESC)
WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_core_usage_unit_time
ON core_usage_records(unit, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_core_usage_season
ON core_usage_records(season, created_at DESC);

-- ===========================================
-- 6. Data Scope Mappings
-- ===========================================

CREATE TABLE IF NOT EXISTS core_data_scope_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES core_projects(id) ON DELETE SET NULL,

  scope_name TEXT NOT NULL,
  source_type TEXT NOT NULL, -- namespace, collection, dataset

  spring_namespace TEXT,
  summer_collection_id UUID,
  fall_dataset_id UUID,

  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_scope_mappings_user
ON core_data_scope_mappings(user_id, scope_name);

-- ===========================================
-- 7. RLS Policies
-- ===========================================

ALTER TABLE core_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_data_scope_mappings ENABLE ROW LEVEL SECURITY;

-- Organizations: Members can view
CREATE POLICY "Members can view organizations"
  ON core_organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM core_organization_members m
      WHERE m.organization_id = core_organizations.id
        AND m.user_id = auth.uid()::TEXT
    )
  );

-- Projects: Members can view
CREATE POLICY "Members can view projects"
  ON core_projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM core_organization_members m
      WHERE m.organization_id = core_projects.organization_id
        AND m.user_id = auth.uid()::TEXT
    )
  );

-- Environments: Members can view
CREATE POLICY "Members can view environments"
  ON core_environments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM core_projects p
      JOIN core_organization_members m ON m.organization_id = p.organization_id
      WHERE p.id = core_environments.project_id
        AND m.user_id = auth.uid()::TEXT
    )
  );

-- Usage: Users can view own usage
CREATE POLICY "Users can view own usage"
  ON core_usage_records FOR SELECT
  USING (user_id = auth.uid()::TEXT);

-- Scope mappings: Users can manage own
CREATE POLICY "Users can view own scope mappings"
  ON core_data_scope_mappings FOR SELECT
  USING (user_id = auth.uid()::TEXT);

CREATE POLICY "Users can insert own scope mappings"
  ON core_data_scope_mappings FOR INSERT
  WITH CHECK (user_id = auth.uid()::TEXT);

CREATE POLICY "Users can update own scope mappings"
  ON core_data_scope_mappings FOR UPDATE
  USING (user_id = auth.uid()::TEXT);
