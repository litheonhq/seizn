import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
config({ path: resolve(__dirname, '../.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING not set');
  process.exit(1);
}

const TABLES = [
  'autopilot_configs',
  'autopilot_webhooks',
  'autopilot_analyses',
  'autopilot_fixes',
  'autopilot_prs',
];

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    console.log('RLS / policies:');
    for (const table of TABLES) {
      // eslint-disable-next-line no-await-in-loop
      const { rows } = await client.query(
        `
          select
            c.relrowsecurity as rls_enabled,
            (select count(*)::int from pg_policies p where p.schemaname='public' and p.tablename=$1) as policy_count,
            has_table_privilege('authenticated', 'public.' || $1, 'select') as authenticated_select
          from pg_class c
          where c.oid = ('public.' || $1)::regclass;
        `,
        [table]
      );
      const row = rows?.[0];
      console.log(
        `- ${table}: rls=${String(row?.rls_enabled)} policies=${String(row?.policy_count)} auth_select=${String(row?.authenticated_select)}`
      );
    }

    const { rows: webhookGrants } = await client.query(
      `
        select grantee, privilege_type
        from information_schema.role_table_grants
        where table_schema='public'
          and table_name='autopilot_webhooks'
          and grantee in ('anon', 'authenticated', 'public')
        order by grantee, privilege_type;
      `
    );
    console.log('\nautopilot_webhooks grants (anon/authenticated/public):');
    for (const g of webhookGrants) {
      console.log(`- ${g.grantee}: ${g.privilege_type}`);
    }

    const { rows: viewPriv } = await client.query(
      "select has_table_privilege('authenticated', 'public.flight_recorder_traces', 'select') as ok;"
    );
    console.log(`\nflight_recorder_traces select for authenticated: ${String(viewPriv?.[0]?.ok)}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Verification failed:', err?.message || err);
  process.exit(1);
});
