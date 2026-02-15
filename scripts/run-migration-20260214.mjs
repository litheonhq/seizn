import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Supabase pooler certificates can fail strict verification on some setups.
// This is a one-off migration script; do NOT use this pattern in app runtime.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Load local env for DB connection (do not print secrets).
config({ path: resolve(__dirname, '../.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING not set');
  process.exit(1);
}

const migrationPath = resolve(
  __dirname,
  '../supabase/migrations/20260214_autopilot_prbot_schema.sql'
);

async function run() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const sql = readFileSync(migrationPath, 'utf8');
    const baseAutopilotPath = resolve(
      __dirname,
      '../supabase/migrations/045_combo_b_autopilot.sql'
    );

    console.log('Running migration 20260214_autopilot_prbot_schema.sql...');
    await client.query('BEGIN');

    // Pre-req: base autopilot tables must exist before we can ALTER them.
    const { rows: pre } = await client.query(
      "select to_regclass('public.autopilot_analyses') as autopilot_analyses;"
    );
    const hasAutopilotAnalyses = Boolean(pre?.[0]?.autopilot_analyses);
    if (!hasAutopilotAnalyses) {
      console.log('Base autopilot tables missing; applying 045_combo_b_autopilot.sql first...');
      const baseSql = readFileSync(baseAutopilotPath, 'utf8');
      await client.query(baseSql);
      console.log('Base autopilot schema applied.');
    }

    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied.');

    // ----------------------------
    // Post-apply verification
    // ----------------------------
    const checks = [
      {
        name: 'flight_recorder_traces view exists',
        query: "select to_regclass('public.flight_recorder_traces') is not null as ok;",
      },
      {
        name: 'autopilot_configs table exists',
        query: "select to_regclass('public.autopilot_configs') is not null as ok;",
      },
      {
        name: 'autopilot_webhooks table exists',
        query: "select to_regclass('public.autopilot_webhooks') is not null as ok;",
      },
      {
        name: 'autopilot_configs RLS enabled',
        query:
          "select relrowsecurity as ok from pg_class where oid='public.autopilot_configs'::regclass;",
      },
      {
        name: 'autopilot_webhooks RLS enabled',
        query:
          "select relrowsecurity as ok from pg_class where oid='public.autopilot_webhooks'::regclass;",
      },
      {
        name: 'autopilot_configs policies present',
        query:
          "select count(*)::int as ok from pg_policies where schemaname='public' and tablename='autopilot_configs';",
      },
      {
        name: 'autopilot_webhooks policies (expected 0)',
        query:
          "select count(*)::int as ok from pg_policies where schemaname='public' and tablename='autopilot_webhooks';",
      },
      {
        name: 'authenticated can SELECT flight_recorder_traces',
        query:
          "select has_table_privilege('authenticated', 'public.flight_recorder_traces', 'select') as ok;",
      },
      {
        name: 'autopilot_prs has pr_number column',
        query:
          "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='autopilot_prs' and column_name='pr_number') as ok;",
      },
      {
        name: 'autopilot_prs has context column',
        query:
          "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='autopilot_prs' and column_name='context') as ok;",
      },
      {
        name: 'autopilot_fixes has pr_context column',
        query:
          "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='autopilot_fixes' and column_name='pr_context') as ok;",
      },
      {
        name: 'autopilot_analyses has analysis column',
        query:
          "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='autopilot_analyses' and column_name='analysis') as ok;",
      },
    ];

    console.log('\nVerification:');
    for (const c of checks) {
      // eslint-disable-next-line no-await-in-loop
      const { rows } = await client.query(c.query);
      const ok = rows?.[0]?.ok;
      console.log(`- ${c.name}: ${String(ok)}`);
    }
  } catch (err) {
    try {
      // Best-effort rollback if we already started a transaction.
      // eslint-disable-next-line no-await-in-loop
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Migration failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
