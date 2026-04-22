import { createHash } from 'node:crypto';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({
  path: process.env.SEIZN_ENV_FILE || resolve(__dirname, '../../.env.local'),
  override: true,
});

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING not set');
  process.exit(1);
}

function canonicalize(value) {
  return JSON.stringify(sortForReplay(value));
}

function sha256(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function buildSnapshotStubHash(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  return sha256(
    toolCalls.map((call) => {
      if (!call || typeof call !== 'object' || Array.isArray(call)) return call;
      const input = 'input' in call ? call.input : call.args;
      const inputHash = typeof call.inputHash === 'string' ? call.inputHash : sha256(input);
      const stubHash =
        typeof call.stubHash === 'string' ? call.stubHash : sha256({ name: call.name, input });
      return {
        name: call.name,
        inputHash,
        stubHash,
      };
    })
  );
}

function sortForReplay(value) {
  if (Array.isArray(value)) return value.map(sortForReplay);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortForReplay(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function pgConfigFromConnectionString(cs) {
  const url = new URL(cs);
  return {
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    database: url.pathname?.replace(/^\//, '') || undefined,
  };
}

const client = new pg.Client({
  ...pgConfigFromConnectionString(connectionString),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const { rows } = await client.query(`
    SELECT trace_id, tool_calls, stub_hash
    FROM public.replay_snapshots
    WHERE jsonb_array_length(tool_calls) > 0
  `);

  let updated = 0;
  for (const row of rows) {
    const stubHash = buildSnapshotStubHash(row.tool_calls);
    if (!stubHash || row.stub_hash === stubHash) continue;
    await client.query(
      'UPDATE public.replay_snapshots SET stub_hash = $1 WHERE trace_id = $2 AND stub_hash IS DISTINCT FROM $1',
      [stubHash, row.trace_id]
    );
    updated += 1;
  }

  console.log(`Replay stub hash backfill complete. Updated ${updated} snapshot(s).`);
} finally {
  await client.end();
}
