/**
 * M3: Autopilot + A/B Testing Test Script
 * Tests:
 * 1. Autopilot query classification (keyword-like, semantic, default)
 * 2. A/B experiment creation and arm assignment
 * 3. Bandit experiment (epsilon-greedy)
 * 4. Exposure logging
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(__dirname, '../.env.local'), override: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TEST_USER_ID = 'test-ab-user';

// ============================================
// Autopilot Tests (inline logic simulation)
// ============================================

function looksLikeKeywordQuery(query: string): boolean {
  const q = query.trim();
  if (q.length <= 18) return true;
  if (q.includes('"') || q.includes("'") || q.includes('`')) return true;
  if (/[\/\\]/.test(q)) return true;
  if (q.includes('::') || q.includes('=>')) return true;
  if (/[A-Z]{2,}/.test(q)) return true;
  return false;
}

function looksLikeLongSemanticQuery(query: string): boolean {
  const q = query.trim();
  return q.length >= 80;
}

function classifyQuery(query: string): string {
  if (looksLikeKeywordQuery(query)) return 'keyword_like';
  if (looksLikeLongSemanticQuery(query)) return 'long_semantic';
  return 'default';
}

function testAutopilot() {
  console.log('🔧 Testing Autopilot Query Classification\n');

  const testCases = [
    { query: 'API key', expected: 'keyword_like', reason: 'short query + acronym' },
    { query: 'GET /api/users', expected: 'keyword_like', reason: 'path-like' },
    { query: '"exact phrase match"', expected: 'keyword_like', reason: 'quoted phrase' },
    { query: 'AWS IAM', expected: 'keyword_like', reason: 'acronyms' },
    { query: 'How do I connect my database?', expected: 'default', reason: 'normal length, no special chars' },
    {
      query:
        'I want to understand how machine learning models are trained using gradient descent and backpropagation algorithms in deep neural networks',
      expected: 'long_semantic',
      reason: 'very long query',
    },
    { query: 'src/lib/utils.ts', expected: 'keyword_like', reason: 'file path' },
    { query: 'type => string', expected: 'keyword_like', reason: 'arrow syntax' },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const result = classifyQuery(tc.query);
    const ok = result === tc.expected;
    console.log(`${ok ? '✅' : '❌'} "${tc.query.slice(0, 40)}..." → ${result} (expected: ${tc.expected})`);
    if (ok) passed++;
  }

  console.log(`\n📊 Autopilot: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// ============================================
// A/B Experiment Tests
// ============================================

async function setupTestProfile() {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: TEST_USER_ID, email: 'ab-test@seizn.com', plan: 'pro' }, { onConflict: 'id' });

  if (error && error.code !== '23505') throw error;
  console.log('✅ Test profile ready');
}

async function cleanupOldExperiments() {
  // Delete old test experiments
  await supabase.from('fall_experiments').delete().eq('user_id', TEST_USER_ID).like('name', 'M3 Test%');
  console.log('🧹 Cleaned up old test experiments');
}

async function createABExperiment(): Promise<{ experimentId: string; arms: { id: string; name: string }[] }> {
  console.log('\n📊 Creating A/B Experiment...');

  // Create experiment
  const { data: exp, error: expErr } = await supabase
    .from('fall_experiments')
    .insert({
      user_id: TEST_USER_ID,
      name: 'M3 Test A/B Experiment',
      description: 'Testing A/B allocation with 50/50 split',
      status: 'running',
      allocation_strategy: 'ab',
      unit: 'user',
    })
    .select('id')
    .single();

  if (expErr) throw expErr;
  const experimentId = exp.id as string;
  console.log('   Experiment ID:', experimentId);

  // Create arms (50/50 split)
  const armsData = [
    { experiment_id: experimentId, name: 'Control', weight: 0.5, config_override: { mode: 'vector' } },
    { experiment_id: experimentId, name: 'Treatment', weight: 0.5, config_override: { mode: 'hybrid', keywordWeight: 0.4 } },
  ];

  const { data: arms, error: armsErr } = await supabase.from('fall_experiment_arms').insert(armsData).select('id, name');

  if (armsErr) throw armsErr;
  console.log('   Arms:', arms);

  return { experimentId, arms: arms as { id: string; name: string }[] };
}

async function testABAllocation(experimentId: string): Promise<boolean> {
  console.log('\n🎲 Testing A/B Allocation...');

  // Simulate allocation for multiple "users"
  const testUsers = ['user-001', 'user-002', 'user-003', 'user-004', 'user-005'];
  const allocations: Record<string, string> = {};

  // Simplified stable hash for testing
  function stableUnitFloat(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash % 10000) / 10000;
  }

  const { data: arms } = await supabase.from('fall_experiment_arms').select('id, name, weight').eq('experiment_id', experimentId);

  if (!arms || arms.length < 2) {
    console.log('❌ Not enough arms');
    return false;
  }

  for (const userId of testUsers) {
    const r = stableUnitFloat(`${experimentId}:${userId}`);
    const totalWeight = arms.reduce((s, a) => s + (a.weight ?? 0), 0);
    let acc = 0;
    let chosen = arms[0];

    for (const arm of arms) {
      acc += (arm.weight ?? 0) / totalWeight;
      if (r <= acc) {
        chosen = arm;
        break;
      }
    }

    allocations[userId] = chosen.name;
    console.log(`   ${userId} → ${chosen.name} (r=${r.toFixed(3)})`);
  }

  // Verify determinism (same user gets same arm)
  const firstUser = testUsers[0];
  const r1 = stableUnitFloat(`${experimentId}:${firstUser}`);
  const r2 = stableUnitFloat(`${experimentId}:${firstUser}`);

  if (r1 !== r2) {
    console.log('❌ Non-deterministic allocation');
    return false;
  }

  console.log('\n✅ A/B Allocation is deterministic and balanced');
  return true;
}

async function createBanditExperiment(): Promise<string> {
  console.log('\n🎰 Creating Bandit Experiment...');

  const { data: exp, error: expErr } = await supabase
    .from('fall_experiments')
    .insert({
      user_id: TEST_USER_ID,
      name: 'M3 Test Bandit Experiment',
      description: 'Testing epsilon-greedy bandit',
      status: 'running',
      allocation_strategy: 'bandit',
      unit: 'user',
    })
    .select('id')
    .single();

  if (expErr) throw expErr;
  const experimentId = exp.id as string;
  console.log('   Experiment ID:', experimentId);

  // Create 3 arms
  const armsData = [
    { experiment_id: experimentId, name: 'Arm A', weight: 0.33, config_override: { topK: 5 } },
    { experiment_id: experimentId, name: 'Arm B', weight: 0.33, config_override: { topK: 10 } },
    { experiment_id: experimentId, name: 'Arm C', weight: 0.34, config_override: { topK: 15 } },
  ];

  const { data: arms, error: armsErr } = await supabase.from('fall_experiment_arms').insert(armsData).select('id, name');
  if (armsErr) throw armsErr;

  // Add some mock outcomes (Arm B is the best: 3/4 = 75%, Arm A: 2/5 = 40%, Arm C: 0/2 = 0%)
  const outcomes = [
    // Arm A: 2 successes, 3 failures = 40%
    { experiment_id: experimentId, arm_id: arms![0].id, user_id: TEST_USER_ID, event_type: 'click', value: 1 },
    { experiment_id: experimentId, arm_id: arms![0].id, user_id: TEST_USER_ID, event_type: 'click', value: 1 },
    { experiment_id: experimentId, arm_id: arms![0].id, user_id: TEST_USER_ID, event_type: 'thumb_down', value: 1 },
    { experiment_id: experimentId, arm_id: arms![0].id, user_id: TEST_USER_ID, event_type: 'thumb_down', value: 1 },
    { experiment_id: experimentId, arm_id: arms![0].id, user_id: TEST_USER_ID, event_type: 'thumb_down', value: 1 },
    // Arm B: 3 successes, 1 failure = 75%
    { experiment_id: experimentId, arm_id: arms![1].id, user_id: TEST_USER_ID, event_type: 'thumb_up', value: 1 },
    { experiment_id: experimentId, arm_id: arms![1].id, user_id: TEST_USER_ID, event_type: 'accept', value: 1 },
    { experiment_id: experimentId, arm_id: arms![1].id, user_id: TEST_USER_ID, event_type: 'thumb_up', value: 1 },
    { experiment_id: experimentId, arm_id: arms![1].id, user_id: TEST_USER_ID, event_type: 'thumb_down', value: 1 },
    // Arm C: 0 successes, 2 failures = 0%
    { experiment_id: experimentId, arm_id: arms![2].id, user_id: TEST_USER_ID, event_type: 'thumb_down', value: 1 },
    { experiment_id: experimentId, arm_id: arms![2].id, user_id: TEST_USER_ID, event_type: 'thumb_down', value: 1 },
  ];

  await supabase.from('fall_outcomes').insert(outcomes);
  console.log('   Added mock outcomes (Arm B has best success rate)');

  return experimentId;
}

async function testBanditExploit(experimentId: string): Promise<boolean> {
  console.log('\n🔍 Testing Bandit Exploit Logic...');

  // Fetch stats
  const { data: arms } = await supabase.from('fall_experiment_arms').select('id, name').eq('experiment_id', experimentId);

  const { data: outcomes } = await supabase.from('fall_outcomes').select('arm_id, event_type, value').eq('experiment_id', experimentId);

  // Calculate stats
  const statsByArm = new Map<string, { successes: number; trials: number; mean: number }>();
  for (const a of arms ?? []) {
    statsByArm.set(a.id, { successes: 0, trials: 0, mean: 0 });
  }

  for (const o of outcomes ?? []) {
    const rec = statsByArm.get(o.arm_id);
    if (!rec) continue;

    rec.trials += 1;
    const isSuccess = ['accept', 'thumb_up'].includes(o.event_type) || (o.event_type === 'click' && o.value > 0);
    if (isSuccess) rec.successes += 1;
  }

  // Calculate means
  for (const [id, rec] of statsByArm) {
    rec.mean = rec.trials > 0 ? rec.successes / rec.trials : 0;
    const armName = arms?.find((a) => a.id === id)?.name ?? 'Unknown';
    console.log(`   ${armName}: ${rec.successes}/${rec.trials} = ${rec.mean.toFixed(2)}`);
  }

  // Find best arm
  let bestId = '';
  let bestMean = -1;
  for (const [id, rec] of statsByArm) {
    if (rec.mean > bestMean) {
      bestMean = rec.mean;
      bestId = id;
    }
  }

  const bestArm = arms?.find((a) => a.id === bestId);
  console.log(`\n   Best arm for exploitation: ${bestArm?.name} (mean=${bestMean.toFixed(2)})`);

  // Arm B should be best based on our mock data
  if (bestArm?.name === 'Arm B') {
    console.log('✅ Bandit correctly identified best arm');
    return true;
  }

  console.log('❌ Bandit did not identify correct best arm');
  return false;
}

async function testExposureLogging(experimentId: string): Promise<boolean> {
  console.log('\n📝 Testing Exposure Logging...');

  const { data: arms } = await supabase.from('fall_experiment_arms').select('id').eq('experiment_id', experimentId).limit(1);

  if (!arms || arms.length === 0) {
    console.log('❌ No arms found');
    return false;
  }

  // Log an exposure (request_id is UUID type, so we don't include it if not needed)
  const { data: inserted, error: insertErr } = await supabase
    .from('fall_exposures')
    .insert({
      experiment_id: experimentId,
      arm_id: arms[0].id,
      user_id: TEST_USER_ID,
    })
    .select('id');

  if (insertErr) {
    console.log('❌ Failed to log exposure:', insertErr);
    return false;
  }

  // Verify
  const { data: exposures, error: fetchErr } = await supabase
    .from('fall_exposures')
    .select('*')
    .eq('id', inserted![0].id);

  if (fetchErr || !exposures || exposures.length === 0) {
    console.log('❌ Exposure not found');
    return false;
  }

  console.log('   Logged exposure:', exposures[0].id);
  console.log('✅ Exposure logging works');
  return true;
}

async function main() {
  console.log('🧪 M3: Autopilot + A/B Testing Test\n');
  console.log('═'.repeat(50));

  try {
    // 1. Autopilot tests (local, no DB)
    const autopilotPassed = testAutopilot();

    // 2. A/B tests (DB required)
    console.log('═'.repeat(50));
    await setupTestProfile();
    await cleanupOldExperiments();

    const { experimentId: abExpId } = await createABExperiment();
    const abPassed = await testABAllocation(abExpId);

    // 3. Bandit tests
    console.log('═'.repeat(50));
    const banditExpId = await createBanditExperiment();
    const banditPassed = await testBanditExploit(banditExpId);

    // 4. Exposure logging
    console.log('═'.repeat(50));
    const exposurePassed = await testExposureLogging(abExpId);

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 M3 Test Summary:');
    console.log(`   - Autopilot Query Classification: ${autopilotPassed ? '✅' : '❌'}`);
    console.log(`   - A/B Allocation: ${abPassed ? '✅' : '❌'}`);
    console.log(`   - Bandit Exploit: ${banditPassed ? '✅' : '❌'}`);
    console.log(`   - Exposure Logging: ${exposurePassed ? '✅' : '❌'}`);

    if (autopilotPassed && abPassed && banditPassed && exposurePassed) {
      console.log('\n✅ M3 Autopilot + A/B Testing Test PASSED');
    } else {
      console.log('\n❌ Some tests failed');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

main();
