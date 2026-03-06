import pg from 'pg';
import { loadLocalEnv } from './load-local-env.mjs';
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadLocalEnv(import.meta.url);

const connectionString = process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING not set');
  process.exit(1);
}

async function runMigration() {
  console.log('?뵩 Running migration 027_fix_audit_function_overload.sql...\n');

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('??Connected to database\n');

    const sql = readFileSync(
      resolve(__dirname, '../supabase/migrations/027_fix_audit_function_overload.sql'),
      'utf8'
    );

    console.log('Executing migration...\n');
    const result = await client.query(sql);

    console.log('??Migration completed successfully!\n');

    // Show result
    if (result && Array.isArray(result)) {
      const verifyResult = result.find(r => r.rows && r.rows.length > 0);
      if (verifyResult) {
        console.log('Verified function signatures:');
        verifyResult.rows.forEach(row => {
          console.log('  -', row.function_signature);
        });
      }
    }
  } catch (err) {
    console.error('??Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();


