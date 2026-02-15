import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function assertOk(ok, message) {
  if (!ok) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${message}`);
  }
}

async function fetchFunctionDefs(client, name) {
  const { rows } = await client.query(
    `
      SELECT
        p.oid::bigint AS oid,
        pg_get_function_identity_arguments(p.oid) AS args,
        pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = $1
      ORDER BY args;
    `,
    [name]
  );
  return rows;
}

async function main() {
  const client = new pg.Client({
    ...pgConfigFromConnectionString(connectionString),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    // 1) Schema columns exist
    const { rows: memCols } = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='memories'
          AND column_name IN ('is_encrypted','encrypted_content');
      `
    );
    assertOk(memCols.length === 2, 'memories has is_encrypted + encrypted_content columns');

    const { rows: profileCols } = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='profiles'
          AND column_name IN ('e2e_salt','e2e_verification_block','e2e_setup_at');
      `
    );
    assertOk(profileCols.length === 3, 'profiles has e2e_salt + e2e_verification_block + e2e_setup_at columns');

    // 2) Search RPCs exclude encrypted memories
    const targets = ['keyword_search_memories', 'hybrid_search_memories', 'search_memories'];
    for (const fn of targets) {
      // eslint-disable-next-line no-await-in-loop
      const defs = await fetchFunctionDefs(client, fn);
      assertOk(defs.length > 0, `RPC exists: public.${fn}`);

      for (const d of defs) {
        const hasEncryptedFilter = String(d.def).toLowerCase().includes('is_encrypted');
        assertOk(
          hasEncryptedFilter,
          `public.${fn}(${d.args}) excludes encrypted memories (has is_encrypted filter)`
        );
      }
    }

    // 3) flight_recorder_traces hardening checks (security_invoker + grants)
    const { rows: viewRows } = await client.query(
      `
        SELECT reloptions
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname='flight_recorder_traces';
      `
    );
    const reloptions = viewRows?.[0]?.reloptions || [];
    assertOk(
      Array.isArray(reloptions) && reloptions.includes('security_invoker=true'),
      'flight_recorder_traces view has security_invoker=true'
    );

    const { rows: privs } = await client.query(
      `
        SELECT
          has_table_privilege('anon', 'public.flight_recorder_traces', 'select') as anon_select,
          has_table_privilege('authenticated', 'public.flight_recorder_traces', 'select') as authenticated_select,
          has_table_privilege('service_role', 'public.flight_recorder_traces', 'select') as service_role_select;
      `
    );
    const p = privs?.[0] || {};
    assertOk(p.anon_select === false, 'anon cannot SELECT flight_recorder_traces');
    assertOk(p.authenticated_select === false, 'authenticated cannot SELECT flight_recorder_traces');
    assertOk(p.service_role_select === true, 'service_role can SELECT flight_recorder_traces');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Verification failed:', err?.message || err);
  process.exit(1);
});

