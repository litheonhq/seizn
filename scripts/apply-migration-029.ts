/**
 * Apply migration 029: Fix Summer DB Issues
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env.local'), override: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runSQL(sql: string, description: string) {
  console.log(`\n🔄 ${description}...`);
  const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
  if (error) {
    // exec_sql might not exist, try direct approach
    console.log(`   Note: exec_sql not available, using alternative method`);
    return false;
  }
  console.log(`✅ ${description} completed`);
  return true;
}

async function main() {
  console.log('🚀 Applying Migration 029: Fix Summer DB Issues\n');
  console.log('═'.repeat(50));

  try {
    // Since we can't run raw SQL directly, let's verify and document what needs to be done

    // 1. Check if the unique constraint exists
    const { data: constraints, error: constraintErr } = await supabase
      .from('information_schema.table_constraints')
      .select('constraint_name')
      .eq('table_name', 'summer_documents')
      .eq('constraint_type', 'UNIQUE');

    if (constraintErr) {
      console.log('Cannot query information_schema directly from JS client.');
      console.log('\n📝 Please run the following SQL in Supabase SQL Editor:\n');

      const migrationSQL = readFileSync(
        resolve(__dirname, '../supabase/migrations/029_fix_summer_db_issues.sql'),
        'utf-8'
      );

      console.log('═'.repeat(50));
      console.log(migrationSQL);
      console.log('═'.repeat(50));

      console.log('\n🔗 Supabase SQL Editor URL:');
      console.log('   https://supabase.com/dashboard/project/mefsiztbcwknpoqglwmw/sql/new');

      return;
    }

    console.log('Existing constraints:', constraints);

  } catch (err) {
    console.error('Error:', err);

    console.log('\n📝 Please run the migration SQL manually in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/mefsiztbcwknpoqglwmw/sql/new');
  }
}

main();
