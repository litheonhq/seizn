/**
 * Test Budget-Aware Query Planner
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local'), override: true });

import {
  createBudgetAwarePlan,
  optimizePlanForBudget,
  getConfigForLatencyTarget,
} from '../src/lib/summer/autopilot';

// ============================================
// Test: Budget-Aware Plan Creation
// ============================================

function testBudgetAwarePlanCreation(): boolean {
  console.log('📊 Testing Budget-Aware Plan Creation\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test free tier plan
  const freePlan = createBudgetAwarePlan({
    requestId: 'test-free-1',
    userId: 'user-123',
    plan: 'free',
    collectionId: 'col-123',
    query: 'What is machine learning?',
    autopilotEnabled: true,
  });

  checks.push({ name: 'Free plan has config', ok: freePlan.config !== null });
  checks.push({ name: 'Free plan has budget', ok: freePlan.budget !== null });
  checks.push({ name: 'Free plan has execution steps', ok: freePlan.executionSteps.length > 0 });
  checks.push({ name: 'Free plan has trace context', ok: freePlan.traceContext.traceId.length > 0 });
  checks.push({ name: 'Free plan topK limited', ok: freePlan.config.topK <= 50 });

  // Test pro tier plan
  const proPlan = createBudgetAwarePlan({
    requestId: 'test-pro-1',
    userId: 'user-123',
    plan: 'pro',
    collectionId: 'col-123',
    query: 'Explain the difference between supervised and unsupervised learning in detail.',
    autopilotEnabled: true,
  });

  checks.push({ name: 'Pro plan has rerank enabled', ok: proPlan.config.rerank === true });
  checks.push({ name: 'Pro plan has higher topK', ok: proPlan.config.topK > freePlan.config.topK });
  checks.push({ name: 'Pro plan estimated cost > 0', ok: proPlan.estimatedCost > 0 });
  checks.push({ name: 'Pro plan estimated latency > 0', ok: proPlan.estimatedLatencyMs > 0 });

  // Test enterprise tier plan
  const enterprisePlan = createBudgetAwarePlan({
    requestId: 'test-enterprise-1',
    userId: 'user-123',
    plan: 'enterprise',
    collectionId: 'col-123',
    query: 'How do transformer architectures work?',
    autopilotEnabled: true,
  });

  checks.push({ name: 'Enterprise plan has higher limits', ok: enterprisePlan.budget.maxCandidates > proPlan.budget.maxCandidates });

  // Test with budget override
  const overridePlan = createBudgetAwarePlan({
    requestId: 'test-override-1',
    userId: 'user-123',
    plan: 'pro',
    collectionId: 'col-123',
    query: 'Test query',
    autopilotEnabled: true,
    budgetOverride: {
      latencyBudgetMs: 1000,
      maxCandidates: 30,
    },
  });

  checks.push({ name: 'Budget override applied', ok: overridePlan.budget.latencyBudgetMs === 1000 });
  checks.push({ name: 'Max candidates override applied', ok: overridePlan.budget.maxCandidates === 30 });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Budget-Aware Plan Creation: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Execution Steps
// ============================================

function testExecutionSteps(): boolean {
  console.log('🔄 Testing Execution Steps\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test hybrid mode execution steps
  const hybridPlan = createBudgetAwarePlan({
    requestId: 'test-hybrid-1',
    userId: 'user-123',
    plan: 'pro',
    collectionId: 'col-123',
    query: 'Search query test',
    autopilotEnabled: false,
    override: { mode: 'hybrid', rerank: true },
  });

  const stepNames = hybridPlan.executionSteps.map((s) => s.name);

  checks.push({ name: 'Has embed_query step', ok: stepNames.includes('embed_query') });
  checks.push({ name: 'Has vector_search step', ok: stepNames.includes('vector_search') });
  checks.push({ name: 'Has keyword_search step', ok: stepNames.includes('keyword_search') });
  checks.push({ name: 'Has hybrid_merge step', ok: stepNames.includes('hybrid_merge') });
  checks.push({ name: 'Has rerank step', ok: stepNames.includes('rerank') });
  checks.push({ name: 'Has dedup step', ok: stepNames.includes('dedup') });

  // Verify step estimates
  const embedStep = hybridPlan.executionSteps.find((s) => s.name === 'embed_query');
  checks.push({ name: 'Embed step has latency estimate', ok: (embedStep?.estimatedLatencyMs ?? 0) > 0 });

  const rerankStep = hybridPlan.executionSteps.find((s) => s.name === 'rerank');
  checks.push({ name: 'Rerank step has cost estimate', ok: (rerankStep?.estimatedCost ?? 0) > 0 });

  // Test vector-only mode
  const vectorPlan = createBudgetAwarePlan({
    requestId: 'test-vector-1',
    userId: 'user-123',
    plan: 'free',
    collectionId: 'col-123',
    query: 'Vector search test',
    autopilotEnabled: false,
    override: { mode: 'vector', rerank: false },
  });

  const vectorStepNames = vectorPlan.executionSteps.map((s) => s.name);
  checks.push({ name: 'Vector mode has no keyword_search', ok: !vectorStepNames.includes('keyword_search') });
  checks.push({ name: 'Vector mode has no hybrid_merge', ok: !vectorStepNames.includes('hybrid_merge') });
  checks.push({ name: 'No rerank when disabled', ok: !vectorStepNames.includes('rerank') });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Execution Steps: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Plan Optimization
// ============================================

function testPlanOptimization(): boolean {
  console.log('⚡ Testing Plan Optimization\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Create a plan that exceeds budget
  const expensivePlan = createBudgetAwarePlan({
    requestId: 'test-expensive-1',
    userId: 'user-123',
    plan: 'free',
    collectionId: 'col-123',
    query: 'Expensive query',
    autopilotEnabled: false,
    override: {
      topK: 100,
      rerankTopN: 50,
      searchEf: 100,
      rerank: true,
    },
  });

  // Note: Our budget limits should have already capped these values
  checks.push({ name: 'Budget limits applied to topK', ok: expensivePlan.config.topK <= expensivePlan.budget.maxCandidates });
  checks.push({ name: 'Budget limits applied to rerankTopN', ok: expensivePlan.config.rerankTopN <= expensivePlan.budget.maxRerankN });

  // Test optimization function
  const planToOptimize = createBudgetAwarePlan({
    requestId: 'test-optimize-1',
    userId: 'user-123',
    plan: 'pro',
    collectionId: 'col-123',
    query: 'Query to optimize',
    autopilotEnabled: false,
    override: {
      topK: 50,
      rerankTopN: 40,
      searchEf: 80,
      rerank: true,
    },
    budgetOverride: {
      latencyBudgetMs: 200, // Very tight budget
    },
  });

  const optimized = optimizePlanForBudget(planToOptimize, {
    maxLatencyMs: 200,
  });

  checks.push({ name: 'Optimization reduces config', ok: optimized.config.rerankTopN <= planToOptimize.config.rerankTopN });
  checks.push({ name: 'Optimization adds warnings', ok: optimized.warnings.length > 0 });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Plan Optimization: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Latency Target Configurations
// ============================================

function testLatencyTargetConfigs(): boolean {
  console.log('🎯 Testing Latency Target Configurations\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Ultra-fast config (< 200ms)
  const ultraFast = getConfigForLatencyTarget(150, 'pro');
  checks.push({ name: 'Ultra-fast uses vector mode', ok: ultraFast.mode === 'vector' });
  checks.push({ name: 'Ultra-fast disables rerank', ok: ultraFast.rerank === false });
  checks.push({ name: 'Ultra-fast has low topK', ok: (ultraFast.topK ?? 100) <= 8 });

  // Fast config (< 500ms)
  const fast = getConfigForLatencyTarget(400, 'pro');
  checks.push({ name: 'Fast uses hybrid mode', ok: fast.mode === 'hybrid' });
  checks.push({ name: 'Fast enables rerank', ok: fast.rerank === true });
  checks.push({ name: 'Fast has limited rerankTopN', ok: (fast.rerankTopN ?? 100) <= 8 });

  // Standard config (< 1000ms)
  const standard = getConfigForLatencyTarget(800, 'pro');
  checks.push({ name: 'Standard uses hybrid mode', ok: standard.mode === 'hybrid' });
  checks.push({ name: 'Standard has moderate rerankTopN', ok: (standard.rerankTopN ?? 0) <= 15 });

  // Quality config (>= 1000ms)
  const quality = getConfigForLatencyTarget(2000, 'pro');
  checks.push({ name: 'Quality enables full rerank', ok: quality.rerank === true });

  // Test different plans
  const freeConfig = getConfigForLatencyTarget(500, 'free');
  const proConfig = getConfigForLatencyTarget(500, 'pro');
  checks.push({ name: 'Free has lower limits than pro', ok: (freeConfig.topK ?? 0) <= (proConfig.topK ?? 0) });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Latency Target Configurations: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('🧪 Budget-Aware Query Planner Test\n');
  console.log('═'.repeat(50));

  const planCreationPassed = testBudgetAwarePlanCreation();

  console.log('═'.repeat(50));
  const executionStepsPassed = testExecutionSteps();

  console.log('═'.repeat(50));
  const optimizationPassed = testPlanOptimization();

  console.log('═'.repeat(50));
  const latencyConfigPassed = testLatencyTargetConfigs();

  // Summary
  console.log('═'.repeat(50));
  console.log('📊 Budget Planner Test Summary:');
  console.log(`   - Plan Creation: ${planCreationPassed ? '✅' : '❌'}`);
  console.log(`   - Execution Steps: ${executionStepsPassed ? '✅' : '❌'}`);
  console.log(`   - Optimization: ${optimizationPassed ? '✅' : '❌'}`);
  console.log(`   - Latency Configs: ${latencyConfigPassed ? '✅' : '❌'}`);

  const allPassed = planCreationPassed && executionStepsPassed && optimizationPassed && latencyConfigPassed;

  if (allPassed) {
    console.log('\n✅ Budget Planner Test PASSED');
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main();
