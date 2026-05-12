#!/usr/bin/env node

import pg from 'pg';
import { loadLocalEnv } from './load-local-env.mjs';

// NOTE: Avoid NODE_TLS_REJECT_UNAUTHORIZED=0. Use per-connection SSL options.
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

async function fetchTableColumns(client, tableName) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1;
    `,
    [tableName]
  );

  return new Set(rows.map((row) => row.column_name));
}

async function assertTableColumns(client, tableName, requiredColumns) {
  const columns = await fetchTableColumns(client, tableName);
  assertOk(columns.size > 0, `table exists: public.${tableName}`);

  if (columns.size === 0) {
    return;
  }

  const missing = requiredColumns.filter((column) => !columns.has(column));
  assertOk(
    missing.length === 0,
    `public.${tableName} has required columns: ${requiredColumns.join(', ')}`
  );
}

async function assertIndexesExist(client, indexNames) {
  const { rows } = await client.query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[]);
    `,
    [indexNames]
  );
  const existing = new Set(rows.map((row) => row.indexname));

  for (const indexName of indexNames) {
    assertOk(existing.has(indexName), `index exists: public.${indexName}`);
  }
}

async function assertRlsEnabled(client, tableNames) {
  const { rows } = await client.query(
    `
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[]);
    `,
    [tableNames]
  );
  const byTable = new Map(rows.map((row) => [row.relname, row.relrowsecurity]));

  for (const tableName of tableNames) {
    assertOk(byTable.get(tableName) === true, `RLS enabled: public.${tableName}`);
  }
}

async function assertPoliciesExist(client, expectedPolicies) {
  const { rows } = await client.query(
    `
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname = ANY($1::text[]);
    `,
    [expectedPolicies.map((policy) => policy.policyName)]
  );
  const actual = new Set(rows.map((row) => `${row.tablename}:${row.policyname}`));

  for (const { tableName, policyName } of expectedPolicies) {
    assertOk(
      actual.has(`${tableName}:${policyName}`),
      `policy exists: public.${tableName} "${policyName}"`
    );
  }
}

async function assertTablePrivilege(client, role, tableName, privilege) {
  const { rows } = await client.query(
    'SELECT has_table_privilege($1, $2, $3) AS ok;',
    [role, `public.${tableName}`, privilege]
  );

  assertOk(rows[0]?.ok === true, `${role} has ${privilege} on public.${tableName}`);
}

async function assertSequencePrivilege(client, role, sequenceName, privilege) {
  const { rows } = await client.query(
    'SELECT has_sequence_privilege($1, $2, $3) AS ok;',
    [role, `public.${sequenceName}`, privilege]
  );

  assertOk(rows[0]?.ok === true, `${role} has ${privilege} on public.${sequenceName}`);
}

async function assertConstraintExists(client, tableName, constraintName) {
  const { rows } = await client.query(
    `
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = 'public'
        AND rel.relname = $1
        AND con.conname = $2
      LIMIT 1;
    `,
    [tableName, constraintName]
  );

  assertOk(rows.length === 1, `constraint exists: public.${tableName}.${constraintName}`);
}

async function main() {
  const client = new pg.Client({
    ...pgConfigFromConnectionString(connectionString),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await assertTableColumns(client, 'api_keys', [
      'prefix',
      'hash',
      'rate_limit_per_minute',
      'monthly_quota',
      'monthly_quota_period',
      'revoked_at',
      'rotated_from_id',
      'org_id',
    ]);

    await assertTableColumns(client, 'api_key_usage', [
      'id',
      'api_key_id',
      'tool',
      'project_id',
      'cost_units',
      'llm_cost_usd_milli',
      'llm_provider',
      'llm_model',
      'occurred_at',
    ]);

    await assertTableColumns(client, 'api_key_audit_log', [
      'id',
      'api_key_id',
      'user_id',
      'org_id',
      'action',
      'metadata',
      'occurred_at',
    ]);

    await assertConstraintExists(client, 'api_keys', 'api_keys_monthly_quota_period_check');
    await assertConstraintExists(client, 'api_key_audit_log', 'api_key_audit_log_action_check');

    await assertIndexesExist(client, [
      'api_keys_prefix_uniq',
      'api_keys_user_idx',
      'api_keys_org_idx',
      'api_key_usage_key_month_idx',
      'api_key_audit_log_user_idx',
      'api_key_audit_log_org_idx',
    ]);

    await assertRlsEnabled(client, [
      'api_keys',
      'api_key_usage',
      'api_key_audit_log',
    ]);

    await assertPoliciesExist(client, [
      { tableName: 'api_keys', policyName: 'track2 users see own keys' },
      { tableName: 'api_keys', policyName: 'track2 users insert own keys' },
      { tableName: 'api_keys', policyName: 'track2 users revoke own keys' },
      { tableName: 'api_key_usage', policyName: 'track2 users see own usage' },
      { tableName: 'api_key_audit_log', policyName: 'track2 users see own audit' },
    ]);

    await assertTablePrivilege(client, 'authenticated', 'api_keys', 'SELECT');
    await assertTablePrivilege(client, 'authenticated', 'api_keys', 'INSERT');
    await assertTablePrivilege(client, 'authenticated', 'api_keys', 'UPDATE');
    await assertTablePrivilege(client, 'authenticated', 'api_key_usage', 'SELECT');
    await assertTablePrivilege(client, 'authenticated', 'api_key_audit_log', 'SELECT');

    for (const tableName of ['api_key_usage', 'api_key_audit_log']) {
      await assertTablePrivilege(client, 'service_role', tableName, 'SELECT');
      await assertTablePrivilege(client, 'service_role', tableName, 'INSERT');
      await assertTablePrivilege(client, 'service_role', tableName, 'UPDATE');
      await assertTablePrivilege(client, 'service_role', tableName, 'DELETE');
    }

    await assertSequencePrivilege(client, 'service_role', 'api_key_usage_id_seq', 'USAGE');
    await assertSequencePrivilege(client, 'service_role', 'api_key_usage_id_seq', 'SELECT');
    await assertSequencePrivilege(client, 'service_role', 'api_key_audit_log_id_seq', 'USAGE');
    await assertSequencePrivilege(client, 'service_role', 'api_key_audit_log_id_seq', 'SELECT');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Verification failed:', err?.message || err);
  process.exit(1);
});
