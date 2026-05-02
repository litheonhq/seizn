import pg from 'pg';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv(import.meta.url);

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING not set');
  process.exit(1);
}

function pgConfigFromConnectionString(cs) {
  const url = new URL(cs);
  const database = url.pathname?.replace(/^\//, '') || undefined;

  return {
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    database,
  };
}

function assertOk(ok, message) {
  if (!ok) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK ${message}`);
  }
}

async function main() {
  const client = new pg.Client({
    ...pgConfigFromConnectionString(connectionString),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows: graphRows } = await client.query(`
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'graph_entities'
        AND c.relkind = 'r'
      LIMIT 1;
    `);
    assertOk(graphRows.length === 1, 'table exists: public.graph_entities');
    assertOk(graphRows[0]?.relrowsecurity === true, 'public.graph_entities has RLS enabled');

    const { rows: exposedDefinerRows } = await client.query(`
      SELECT p.oid::regprocedure::TEXT AS function_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND (
          has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        )
      ORDER BY function_name;
    `);
    assertOk(
      exposedDefinerRows.length === 0,
      `no public SECURITY DEFINER functions executable by anon/authenticated (${exposedDefinerRows.length} remaining)`
    );
    if (exposedDefinerRows.length > 0) {
      for (const row of exposedDefinerRows.slice(0, 10)) {
        console.error(`  remaining: ${row.function_name}`);
      }
    }

    const { rows: extensionRows } = await client.query(`
      SELECT e.extname, n.nspname
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname IN ('vector', 'pg_trgm')
      ORDER BY e.extname;
    `);
    const extensionSchemas = new Map(extensionRows.map((row) => [row.extname, row.nspname]));
    assertOk(extensionSchemas.get('vector') === 'extensions', 'vector extension is outside public');
    assertOk(extensionSchemas.get('pg_trgm') === 'extensions', 'pg_trgm extension is outside public');

    const { rows: searchPathRows } = await client.query(`
      SELECT p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'update_relay_agents_updated_at'
        AND pg_get_function_identity_arguments(p.oid) = ''
      LIMIT 1;
    `);
    const searchPathConfig = searchPathRows[0]?.proconfig ?? [];
    assertOk(
      Array.isArray(searchPathConfig)
        && searchPathConfig.includes('search_path=public, pg_temp'),
      'public.update_relay_agents_updated_at() has fixed search_path'
    );

    const { rows: storyHealthRows } = await client.query(`
      SELECT to_regclass('public.story_health_daily')::TEXT AS matview_name;
    `);
    if (storyHealthRows[0]?.matview_name) {
      const { rows: storyHealthPrivRows } = await client.query(`
        SELECT
          has_table_privilege('anon', 'public.story_health_daily', 'SELECT') AS anon_select,
          has_table_privilege('authenticated', 'public.story_health_daily', 'SELECT') AS authenticated_select,
          has_table_privilege('service_role', 'public.story_health_daily', 'SELECT') AS service_role_select;
      `);
      const privileges = storyHealthPrivRows[0] ?? {};
      assertOk(privileges.anon_select === false, 'anon cannot SELECT public.story_health_daily');
      assertOk(privileges.authenticated_select === false, 'authenticated cannot SELECT public.story_health_daily');
      assertOk(privileges.service_role_select === true, 'service_role can SELECT public.story_health_daily');
    } else {
      console.log('OK public.story_health_daily is absent, materialized_view_in_api lint not applicable');
    }

    const { rows: auditSearchRows } = await client.query(`
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'search_author_audit_log'
      LIMIT 1;
    `);
    assertOk(auditSearchRows.length === 1, 'function exists: public.search_author_audit_log');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Supabase lint verification failed:', error?.message || error);
  process.exit(1);
});
