import pg from 'pg';
import { loadLocalEnv } from './load-local-env.mjs';
import { resolve, dirname, isAbsolute } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// One-off migration runner for Supabase pooler connections.
// NOTE: Avoid setting NODE_TLS_REJECT_UNAUTHORIZED=0 (global TLS disable).
// If your DB requires relaxed verification, use the per-connection `ssl` option below.

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

function resolveMigrationPath(arg) {
  if (!arg) return null;
  return isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
}

async function run() {
  const target = resolveMigrationPath(process.argv[2]);
  if (!target) {
    console.error('Usage: node scripts/run-migration-file.mjs <path-to-sql>');
    process.exit(1);
  }

  const client = new pg.Client({
    ...pgConfigFromConnectionString(connectionString),
    // Supabase pooler can fail strict verification on some local setups.
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const sql = readFileSync(target, 'utf8');

    console.log(`Applying SQL: ${target}`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Done.');

    // Guardrail: after any DB migration, run DB contract verification.
    // Set SKIP_E2E_VERIFY=1 only for emergency/manual scenarios.
    if (process.env.SKIP_E2E_VERIFY !== '1') {
      const verifyCommands = [
        ['verify:e2e-encryption-db', 'npm run verify:e2e-encryption-db'],
        ['verify:runtime-primitives', 'npm run verify:runtime-primitives'],
        ['verify:supabase-lints', 'npm run verify:supabase-lints'],
      ];

      for (const [scriptName, label] of verifyCommands) {
        console.log(`Running post-migration verification: ${label}`);
        const verify = spawnSync('npm', ['run', scriptName], {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });

        if (verify.status !== 0) {
          throw new Error(
            `Post-migration verification failed (${scriptName}). ` +
              'Set SKIP_E2E_VERIFY=1 only if you intentionally need to bypass.'
          );
        }
      }
    } else {
      console.warn('SKIP_E2E_VERIFY=1 set: skipped post-migration verification.');
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();


