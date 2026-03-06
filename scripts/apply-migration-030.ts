/**
 * Apply migration 030: Core Primitives
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import postgres from 'postgres';

config({ path: resolve(__dirname, '../.env.local'), override: true });

const DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL env var');
  process.exit(1);
}

async function main() {
  console.log('🚀 Applying Migration 030: Core Primitives\n');
  console.log('═'.repeat(60));

  const sql = postgres(DATABASE_URL!, { ssl: 'require' });

  try {
    // 1. Create organizations table
    console.log('\n1️⃣ Creating core_organizations table...');
    await sql`
      CREATE TABLE IF NOT EXISTS core_organizations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        settings JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log('   ✅ Done');

    // 2. Create projects table
    console.log('\n2️⃣ Creating core_projects table...');
    await sql`
      CREATE TABLE IF NOT EXISTS core_projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES core_organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        settings JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organization_id, slug)
      )
    `;
    console.log('   ✅ Done');

    // 3. Create environments table
    console.log('\n3️⃣ Creating core_environments table...');
    await sql`
      CREATE TABLE IF NOT EXISTS core_environments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID NOT NULL REFERENCES core_projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'development',
        api_key_prefix TEXT NOT NULL,
        settings JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id, type)
      )
    `;
    console.log('   ✅ Done');

    // 4. Create organization members table
    console.log('\n4️⃣ Creating core_organization_members table...');
    await sql`
      CREATE TABLE IF NOT EXISTS core_organization_members (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES core_organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organization_id, user_id)
      )
    `;
    console.log('   ✅ Done');

    // 5. Create usage records table
    console.log('\n5️⃣ Creating core_usage_records table...');
    await sql`
      CREATE TABLE IF NOT EXISTS core_usage_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        organization_id UUID REFERENCES core_organizations(id) ON DELETE SET NULL,
        project_id UUID REFERENCES core_projects(id) ON DELETE SET NULL,
        environment_id UUID REFERENCES core_environments(id) ON DELETE SET NULL,
        unit TEXT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        cost_credits DOUBLE PRECISION NOT NULL DEFAULT 0,
        season TEXT NOT NULL,
        operation TEXT NOT NULL,
        trace_id TEXT,
        request_id TEXT,
        metadata JSONB DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log('   ✅ Done');

    // 6. Create data scope mappings table
    console.log('\n6️⃣ Creating core_data_scope_mappings table...');
    await sql`
      CREATE TABLE IF NOT EXISTS core_data_scope_mappings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        project_id UUID REFERENCES core_projects(id) ON DELETE SET NULL,
        scope_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        spring_namespace TEXT,
        summer_collection_id UUID,
        fall_dataset_id UUID,
        metadata JSONB DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log('   ✅ Done');

    // 7. Create indexes
    console.log('\n7️⃣ Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_core_organizations_slug ON core_organizations(slug)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_core_projects_org ON core_projects(organization_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_core_environments_project ON core_environments(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_core_org_members_user ON core_organization_members(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_core_usage_user_time ON core_usage_records(user_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_core_usage_unit_time ON core_usage_records(unit, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_core_usage_season ON core_usage_records(season, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_core_scope_mappings_user ON core_data_scope_mappings(user_id, scope_name)`;
    console.log('   ✅ Done');

    // 8. Enable RLS
    console.log('\n8️⃣ Enabling RLS...');
    await sql`ALTER TABLE core_organizations ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE core_projects ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE core_environments ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE core_organization_members ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE core_usage_records ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE core_data_scope_mappings ENABLE ROW LEVEL SECURITY`;
    console.log('   ✅ Done');

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Migration 030 applied successfully!');

  } catch (err) {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
