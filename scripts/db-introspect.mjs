import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// One-off introspection script.
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
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows: allTables } = await client.query(
      "select tablename from pg_tables where schemaname='public' order by tablename;"
    );

    const { rows: autopilotTables } = await client.query(
      "select tablename from pg_tables where schemaname='public' and tablename like 'autopilot%' order by tablename;"
    );

    const { rows: traces } = await client.query(
      "select to_regclass('public.fall_retrieval_traces') as fall_retrieval_traces, to_regclass('public.flight_recorder_traces') as flight_recorder_traces;"
    );

    console.log(`public tables: ${allTables.length}`);
    console.log('autopilot tables:', autopilotTables.map((r) => r.tablename));
    console.log('trace objects:', traces[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Introspection failed:', err?.message || err);
  process.exit(1);
});
