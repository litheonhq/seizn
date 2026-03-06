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

async function getColumnType(client, tableName, columnName) {
  const { rows } = await client.query(
    `
      SELECT format_type(a.atttypid, a.atttypmod) AS column_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = $1
        AND a.attname = $2
        AND a.attnum > 0
        AND NOT a.attisdropped
      LIMIT 1;
    `,
    [tableName, columnName]
  );

  return rows[0]?.column_type || null;
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

async function assertMatchingColumnTypes(client, leftTable, leftColumn, rightTable, rightColumn) {
  const leftType = await getColumnType(client, leftTable, leftColumn);
  const rightType = await getColumnType(client, rightTable, rightColumn);

  assertOk(Boolean(leftType), `column exists: public.${leftTable}.${leftColumn}`);
  assertOk(Boolean(rightType), `column exists: public.${rightTable}.${rightColumn}`);

  if (!leftType || !rightType) {
    return;
  }

  assertOk(
    leftType === rightType,
    `column type match: public.${leftTable}.${leftColumn} (${leftType}) = public.${rightTable}.${rightColumn} (${rightType})`
  );
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
    await assertMatchingColumnTypes(client, 'device_auth_codes', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'device_auth_codes', 'api_key_id', 'api_keys', 'id');

    await assertTableColumns(client, 'api_keys', [
      'user_id',
      'organization_id',
      'key_hash',
      'key_prefix',
      'scopes',
      'scope_config',
      'is_active',
    ]);
    await assertMatchingColumnTypes(client, 'api_keys', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'api_keys', 'organization_id', 'organizations', 'id');

    await assertTableColumns(client, 'organization_members', [
      'user_id',
      'organization_id',
      'invited_by',
    ]);
    await assertMatchingColumnTypes(client, 'organization_members', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'organization_members', 'organization_id', 'organizations', 'id');
    await assertMatchingColumnTypes(client, 'organization_members', 'invited_by', 'profiles', 'id');

    await assertTableColumns(client, 'memories', [
      'user_id',
      'organization_id',
    ]);
    await assertMatchingColumnTypes(client, 'memories', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'memories', 'organization_id', 'organizations', 'id');

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
    await assertMatchingColumnTypes(client, 'sso_sessions', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'sso_sessions', 'organization_id', 'organizations', 'id');

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
    await assertMatchingColumnTypes(client, 'sso_login_attempts', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'sso_login_attempts', 'organization_id', 'organizations', 'id');
    await assertMatchingColumnTypes(client, 'sso_connections', 'organization_id', 'organizations', 'id');
    await assertMatchingColumnTypes(client, 'sso_connections', 'created_by', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'sso_domain_verifications', 'organization_id', 'organizations', 'id');

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
    await assertMatchingColumnTypes(client, 'relay_agents', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'relay_agents', 'org_id', 'organizations', 'id');

    await assertTableColumns(client, 'usage_logs', [
      'user_id',
      'organization_id',
      'api_key_id',
    ]);
    await assertMatchingColumnTypes(client, 'usage_logs', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'usage_logs', 'organization_id', 'organizations', 'id');
    await assertMatchingColumnTypes(client, 'usage_logs', 'api_key_id', 'api_keys', 'id');

    await assertTableColumns(client, 'retrieval_budgets', ['user_id']);
    await assertMatchingColumnTypes(client, 'retrieval_budgets', 'user_id', 'profiles', 'id');

    await assertTableColumns(client, 'budget_degrade_events', ['user_id']);
    await assertMatchingColumnTypes(client, 'budget_degrade_events', 'user_id', 'profiles', 'id');

    await assertTableColumns(client, 'fall_retrieval_traces', ['user_id', 'api_key_id']);
    await assertMatchingColumnTypes(client, 'fall_retrieval_traces', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'fall_retrieval_traces', 'api_key_id', 'api_keys', 'id');

    await assertTableColumns(client, 'webhooks', ['user_id', 'organization_id']);
    await assertMatchingColumnTypes(client, 'webhooks', 'user_id', 'profiles', 'id');
    await assertMatchingColumnTypes(client, 'webhooks', 'organization_id', 'organizations', 'id');

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
