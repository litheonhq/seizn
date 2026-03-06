import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK ${message}`);
  }
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      LIMIT 1;
    `,
    [tableName]
  );

  return rows.length > 0;
}

async function getColumns(client, tableName) {
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
  const exists = await tableExists(client, tableName);
  assertOk(exists, `table exists: public.${tableName}`);
  if (!exists) {
    return;
  }

  const columns = await getColumns(client, tableName);
  const missing = requiredColumns.filter((column) => !columns.has(column));
  assertOk(
    missing.length === 0,
    `public.${tableName} has required columns: ${requiredColumns.join(', ')}`
  );
}

async function indexExists(client, indexName) {
  const { rows } = await client.query(
    `
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = $1
      LIMIT 1;
    `,
    [indexName]
  );

  return rows.length > 0;
}

async function assertIndexExists(client, indexName) {
  const exists = await indexExists(client, indexName);
  assertOk(exists, `index exists: public.${indexName}`);
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

async function assertFunctionExists(client, name) {
  const defs = await fetchFunctionDefs(client, name);
  assertOk(defs.length > 0, `function exists: public.${name}`);
}

async function main() {
  const client = new pg.Client({
    ...pgConfigFromConnectionString(connectionString),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await assertTableColumns(client, 'device_auth_codes', [
      'device_code',
      'user_code',
      'status',
      'expires_at',
      'access_token',
      'approved_at',
    ]);
    await assertIndexExists(client, 'idx_device_auth_codes_device_code');
    await assertIndexExists(client, 'idx_device_auth_codes_user_code');
    await assertIndexExists(client, 'idx_device_auth_codes_expires_at');
    await assertFunctionExists(client, 'cleanup_expired_device_codes');

    await assertTableColumns(client, 'sso_connections', [
      'organization_id',
      'name',
      'provider_type',
      'status',
      'entity_id',
      'sso_url',
      'certificate',
      'sp_entity_id',
      'sp_acs_url',
      'sp_metadata_url',
      'email_domains',
      'attribute_mapping',
      'settings',
      'created_by',
      'created_at',
      'updated_at',
    ]);
    await assertIndexExists(client, 'idx_sso_connections_org');
    await assertIndexExists(client, 'idx_sso_connections_status');
    await assertIndexExists(client, 'idx_sso_connections_domains');

    await assertTableColumns(client, 'sso_domain_verifications', [
      'organization_id',
      'domain',
      'verification_method',
      'verification_token',
      'is_verified',
      'expires_at',
    ]);
    await assertIndexExists(client, 'idx_sso_domain_verifications_domain');

    await assertTableColumns(client, 'sso_sessions', [
      'user_id',
      'organization_id',
      'connection_id',
      'provider',
      'idp_session_id',
      'ip_address',
      'user_agent',
      'expires_at',
      'is_active',
      'last_activity_at',
      'revoked_at',
      'revoked_reason',
    ]);
    await assertIndexExists(client, 'idx_sso_sessions_user');
    await assertIndexExists(client, 'idx_sso_sessions_expires');

    await assertTableColumns(client, 'sso_login_attempts', [
      'connection_id',
      'organization_id',
      'request_id',
      'relay_state',
      'response_status',
      'error_code',
      'error_message',
      'user_id',
      'email',
      'ip_address',
      'user_agent',
    ]);
    await assertIndexExists(client, 'idx_sso_login_attempts_org');
    await assertIndexExists(client, 'idx_sso_login_attempts_created');
    await assertFunctionExists(client, 'find_sso_connection_by_email');

    await assertTableColumns(client, 'relay_agents', [
      'user_id',
      'org_id',
      'name',
      'agent_key',
      'endpoint_url',
      'capabilities',
      'collections',
      'connection_mode',
      'status',
      'last_heartbeat',
      'last_error',
    ]);
    await assertIndexExists(client, 'idx_relays_user');
    await assertIndexExists(client, 'idx_relays_key');
    await assertIndexExists(client, 'idx_relays_status');
    await assertIndexExists(client, 'idx_relays_collections');

    await assertTableColumns(client, 'relay_requests', [
      'relay_id',
      'request_id',
      'status',
      'result_count',
      'latency_ms',
      'error_message',
      'completed_at',
    ]);
    await assertIndexExists(client, 'idx_relay_requests_relay');
    await assertIndexExists(client, 'idx_relay_requests_request_id');
    await assertIndexExists(client, 'idx_relay_requests_status');
    await assertIndexExists(client, 'idx_relay_requests_created');

    await assertTableColumns(client, 'relay_pending_callbacks', [
      'relay_id',
      'request_id',
      'payload',
      'callback_url',
      'expires_at',
      'status',
    ]);
    await assertIndexExists(client, 'idx_relay_callbacks_relay');
    await assertIndexExists(client, 'idx_relay_callbacks_request_id');
    await assertIndexExists(client, 'idx_relay_callbacks_expires');
    await assertFunctionExists(client, 'update_relay_heartbeat');
    await assertFunctionExists(client, 'get_relay_for_collection');
    await assertFunctionExists(client, 'cleanup_expired_relay_callbacks');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Runtime primitive verification failed:', error?.message || error);
  process.exit(1);
});
