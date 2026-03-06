import pg from 'pg';
import { loadLocalEnv } from './load-local-env.mjs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// One-off monitoring script for production sanity checks.
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

function parseSinceArg(argv) {
  const idx = argv.indexOf('--since-hours');
  if (idx === -1) return 24;
  const raw = argv[idx + 1];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.min(Math.max(1, Math.floor(n)), 24 * 14);
}

async function main() {
  const sinceHours = parseSinceArg(process.argv.slice(2));

  const client = new pg.Client({
    ...pgConfigFromConnectionString(connectionString),
    // Supabase pooler can fail strict verification on some local setups.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    console.log(`Autopilot monitoring (last ${sinceHours}h)`);

    const { rows: whCounts } = await client.query(
      `
        select
          event,
          processed,
          count(*)::int as count
        from autopilot_webhooks
        where created_at >= now() - ($1::text || ' hours')::interval
        group by event, processed
        order by event, processed;
      `,
      [sinceHours]
    );

    console.log('\nautopilot_webhooks counts:');
    if (!whCounts?.length) {
      console.log('- (no rows)');
    } else {
      for (const row of whCounts) {
        console.log(`- ${row.event} processed=${String(row.processed)} count=${String(row.count)}`);
      }
    }

    const { rows: recent } = await client.query(
      `
        select
          id,
          event,
          repository,
          processed,
          created_at,
          processed_at
        from autopilot_webhooks
        order by created_at desc
        limit 15;
      `
    );

    console.log('\nrecent autopilot_webhooks (latest 15):');
    for (const r of recent) {
      const ts = String(r.created_at || '').slice(0, 19).replace('T', ' ');
      const processed = String(r.processed);
      console.log(`- ${ts} ${r.event} processed=${processed} repo=${r.repository} id=${String(r.id).slice(0, 8)}`);
    }

    const { rows: prStats } = await client.query(
      `
        select status, count(*)::int as count
        from autopilot_prs
        group by status
        order by count desc, status asc;
      `
    );

    console.log('\nautopilot_prs status counts:');
    if (!prStats?.length) {
      console.log('- (no rows)');
    } else {
      for (const row of prStats) {
        console.log(`- ${row.status}: ${String(row.count)}`);
      }
    }

    const { rows: recentPrs } = await client.query(
      `
        select
          id,
          pr_number,
          status,
          updated_at,
          (context->'metadata'->>'repoFullName') as repo_full_name
        from autopilot_prs
        order by updated_at desc
        limit 10;
      `
    );

    console.log('\nrecent autopilot_prs (latest 10):');
    for (const r of recentPrs) {
      const ts = String(r.updated_at || '').slice(0, 19).replace('T', ' ');
      console.log(`- ${ts} #${String(r.pr_number)} ${r.status} repo=${r.repo_full_name || '(unknown)'} id=${String(r.id).slice(0, 8)}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Monitoring failed:', err?.message || err);
  process.exit(1);
});



