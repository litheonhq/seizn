/**
 * Fall Flight Recorder Test Script
 * Verifies that traces are being stored in DB
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('🔍 Checking Fall Retrieval Traces...\n');

  const { data, error } = await supabase
    .from('fall_retrieval_traces')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('⚠️ No traces found. This is expected if sampling rate filtered them out.');
    console.log('   (pro plan = 50% sample rate, free = 10%)');
    return;
  }

  console.log(`✅ Found ${data.length} traces:\n`);

  for (const trace of data) {
    console.log('─'.repeat(50));
    console.log(`ID: ${trace.id}`);
    console.log(`Request ID: ${trace.request_id}`);
    console.log(`Plan: ${trace.plan}`);
    console.log(`Collection: ${trace.collection_id}`);
    console.log(`Results: ${trace.results_count}`);
    console.log(`Autopilot: ${trace.autopilot_reason}`);
    console.log(`Timings: ${JSON.stringify(trace.timings_ms)}`);
    console.log(`Config: ${JSON.stringify(trace.effective_config)}`);
    console.log(`Sampled: ${trace.sampled}`);
    console.log(`Created: ${trace.created_at}`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log('✅ Flight Recorder is working!');
}

main().catch(console.error);
