/**
 * Deprecated migration runner.
 *
 * This file intentionally contains NO credentials.
 * Use `POSTGRES_URL_NON_POOLING` from `.env.local` via `scripts/run-migration-file.mjs`.
 *
 * Usage:
 *   node scripts/apply-migration.js supabase/migrations/020_spring_schema.sql
 * or:
 *   node scripts/run-migration-file.mjs supabase/migrations/020_spring_schema.sql
 */

const { execFileSync } = require('child_process');
const path = require('path');

const target = process.argv[2] || 'supabase/migrations/020_spring_schema.sql';

execFileSync(
  process.execPath,
  [path.join(__dirname, 'run-migration-file.mjs'), target],
  { stdio: 'inherit' }
);
