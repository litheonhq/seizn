import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// One-off verification script.
// NOTE: Avoid setting NODE_TLS_REJECT_UNAUTHORIZED=0 (global TLS disable).
// If your DB requires relaxed verification, use the per-connection `ssl` option below.
config({ path: resolve(__dirname, '../.env.local') });

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

async function main() {
  const client = new pg.Client({
    ...pgConfigFromConnectionString(connectionString),
    // Supabase pooler can fail strict verification on some local setups.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    console.log('budget_degrade_events:');
    const { rows: existsRows } = await client.query(
      "select to_regclass('public.budget_degrade_events') is not null as ok;"
    );
    console.log(`- exists: ${String(existsRows?.[0]?.ok)}`);

    const { rows: rlsRows } = await client.query(
      "select relrowsecurity as ok from pg_class where oid='public.budget_degrade_events'::regclass;"
    );
    console.log(`- rls_enabled: ${String(rlsRows?.[0]?.ok)}`);

    const { rows: policyRows } = await client.query(
      "select count(*)::int as ok from pg_policies where schemaname='public' and tablename='budget_degrade_events';"
    );
    console.log(`- policy_count: ${String(policyRows?.[0]?.ok)}`);

    const { rows: grantsRows } = await client.query(
      `
        select grantee, privilege_type
        from information_schema.role_table_grants
        where table_schema='public'
          and table_name='budget_degrade_events'
          and grantee in ('anon', 'authenticated', 'public')
        order by grantee, privilege_type;
      `
    );
    console.log('- grants (anon/authenticated/public):');
    if (!grantsRows?.length) console.log('  (none)');
    for (const g of grantsRows) {
      console.log(`  - ${g.grantee}: ${g.privilege_type}`);
    }

    console.log('\nflight_recorder_traces:');
    const { rows: costColumnRows } = await client.query(
      `
        select exists(
          select 1
          from information_schema.columns
          where table_schema='public'
            and table_name='flight_recorder_traces'
            and column_name='cost_usd'
        ) as ok;
      `
    );
    console.log(`- cost_usd column: ${String(costColumnRows?.[0]?.ok)}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Verification failed:', err?.message || err);
  process.exit(1);
});

