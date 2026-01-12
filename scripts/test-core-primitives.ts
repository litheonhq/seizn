/**
 * Test Core Primitives
 * - Budget management
 * - Trace context
 * - Usage tracking
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

// Import primitives
import {
  getDefaultBudget,
  resolveBudget,
  checkBudget,
  estimateCost,
  applyBudgetLimits,
  createTraceContext,
  createChildContext,
  extractFromHeaders,
  injectToHeaders,
  createSpan,
  addSpanTag,
  addSpanLog,
  finishSpan,
  addSeiznBaggage,
} from '../src/lib/core/primitives';

// ============================================
// Test: Budget Management
// ============================================

function testBudgetManagement(): boolean {
  console.log('💰 Testing Budget Management\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test default budgets
  const freeBudget = getDefaultBudget('free');
  const proBudget = getDefaultBudget('pro');
  const enterpriseBudget = getDefaultBudget('enterprise');

  checks.push({ name: 'Free budget has lower limits', ok: freeBudget.maxCandidates < proBudget.maxCandidates });
  checks.push({ name: 'Pro budget has lower limits than enterprise', ok: proBudget.maxCandidates < enterpriseBudget.maxCandidates });
  checks.push({ name: 'Free budget has 50 max candidates', ok: freeBudget.maxCandidates === 50 });

  // Test budget resolution with override
  const resolved = resolveBudget('pro', { maxCandidates: 100 });
  checks.push({ name: 'Override maxCandidates works', ok: resolved.maxCandidates === 100 });

  // Test budget check
  const usage = {
    latencyMs: 1000,
    costCredits: 5,
    candidatesRetrieved: 30,
    documentsReranked: 10,
    contextTokens: 2000,
  };
  const budgetResult = checkBudget('test-request', freeBudget, usage);
  checks.push({ name: 'Usage within budget', ok: budgetResult.withinBudget === true });

  // Test budget violation
  const overUsage = { ...usage, latencyMs: 10000 };
  const overResult = checkBudget('test-request', freeBudget, overUsage);
  checks.push({ name: 'Latency violation detected', ok: overResult.withinBudget === false && overResult.violations.length > 0 });

  // Test cost estimation
  const cost = estimateCost({ embeddingTokens: 1000, searchQueries: 1, rerankDocuments: 10 });
  checks.push({ name: 'Cost estimation positive', ok: cost > 0 });

  // Test budget limits application
  const limited = applyBudgetLimits({ topK: 1000, rerankTopN: 500 }, freeBudget);
  checks.push({ name: 'TopK limited to max candidates', ok: limited.topK === freeBudget.maxCandidates });
  checks.push({ name: 'RerankTopN limited to max rerank N', ok: limited.rerankTopN === freeBudget.maxRerankN });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Budget Management: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Trace Context
// ============================================

function testTraceContext(): boolean {
  console.log('🔍 Testing Trace Context\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Create new trace context
  const ctx = createTraceContext();
  checks.push({ name: 'Trace ID generated', ok: ctx.traceId.length > 0 });
  checks.push({ name: 'Span ID generated', ok: ctx.spanId.length > 0 });
  checks.push({ name: 'Baggage is empty object', ok: Object.keys(ctx.baggage).length === 0 });

  // Create child context
  const child = createChildContext(ctx);
  checks.push({ name: 'Child has same trace ID', ok: child.traceId === ctx.traceId });
  checks.push({ name: 'Child has different span ID', ok: child.spanId !== ctx.spanId });
  checks.push({ name: 'Child has parent span ID', ok: child.parentSpanId === ctx.spanId });

  // Test header injection/extraction
  const headers = injectToHeaders(ctx);
  checks.push({ name: 'Traceparent header generated', ok: 'traceparent' in headers });

  const extracted = extractFromHeaders(headers);
  checks.push({ name: 'Trace ID extracted correctly', ok: extracted?.traceId === ctx.traceId });

  // Test span creation
  const span = createSpan(ctx, 'test-operation', 'summer');
  checks.push({ name: 'Span operation name set', ok: span.operationName === 'test-operation' });
  checks.push({ name: 'Span service set', ok: span.service === 'summer' });

  // Test span tags and logs
  addSpanTag(span, 'test.key', 'test-value');
  checks.push({ name: 'Span tag added', ok: span.tags['test.key'] === 'test-value' });

  addSpanLog(span, 'info', 'Test log message', { extra: 'data' });
  checks.push({ name: 'Span log added', ok: span.logs.length === 1 });

  // Finish span
  const finished = finishSpan(span, 'ok');
  checks.push({ name: 'Span has end time', ok: finished.endTime !== undefined });
  checks.push({ name: 'Span has duration', ok: finished.durationMs !== undefined && finished.durationMs >= 0 });

  // Test Seizn baggage
  const withBaggage = addSeiznBaggage(ctx, {
    userId: 'test-user',
    projectId: 'test-project',
    season: 'summer',
  });
  checks.push({ name: 'Seizn user ID added to baggage', ok: withBaggage.baggage['seizn.user_id'] === 'test-user' });
  checks.push({ name: 'Seizn season added to baggage', ok: withBaggage.baggage['seizn.season'] === 'summer' });

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Trace Context: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Test: Types
// ============================================

function testTypes(): boolean {
  console.log('📦 Testing Types\n');

  const checks: { name: string; ok: boolean }[] = [];

  // Test that types are properly exported
  try {
    // BudgetConfig type check
    const budgetConfig: import('../src/lib/core/primitives').BudgetConfig = {
      latencyBudgetMs: 5000,
      costBudget: 100,
      maxCandidates: 200,
      maxRerankN: 50,
      maxContextTokens: 16000,
      maxConcurrentRequests: 20,
    };
    checks.push({ name: 'BudgetConfig type valid', ok: budgetConfig.latencyBudgetMs === 5000 });

    // TraceContext type check
    const traceCtx: import('../src/lib/core/primitives').TraceContext = {
      traceId: 'test',
      spanId: 'test',
      sampled: true,
      baggage: {},
    };
    checks.push({ name: 'TraceContext type valid', ok: traceCtx.sampled === true });

    // UsageRecord type check
    const usageRecord: Partial<import('../src/lib/core/primitives').UsageRecord> = {
      unit: 'search_query',
      quantity: 1,
      season: 'summer',
    };
    checks.push({ name: 'UsageRecord type valid', ok: usageRecord.unit === 'search_query' });

    // Policy type check
    const policy: Partial<import('../src/lib/core/primitives').Policy> = {
      type: 'retention',
      scope: 'global',
      isActive: true,
    };
    checks.push({ name: 'Policy type valid', ok: policy.type === 'retention' });

  } catch (err) {
    checks.push({ name: 'Types import failed', ok: false });
  }

  let passed = 0;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✅' : '❌'} ${check.name}`);
    if (check.ok) passed++;
  }

  console.log(`\n📊 Types: ${passed}/${checks.length} tests passed\n`);
  return passed === checks.length;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('🧪 Core Primitives Test\n');
  console.log('═'.repeat(50));

  const budgetPassed = testBudgetManagement();

  console.log('═'.repeat(50));
  const tracePassed = testTraceContext();

  console.log('═'.repeat(50));
  const typesPassed = testTypes();

  // Summary
  console.log('═'.repeat(50));
  console.log('📊 Core Primitives Test Summary:');
  console.log(`   - Budget Management: ${budgetPassed ? '✅' : '❌'}`);
  console.log(`   - Trace Context: ${tracePassed ? '✅' : '❌'}`);
  console.log(`   - Types: ${typesPassed ? '✅' : '❌'}`);

  const allPassed = budgetPassed && tracePassed && typesPassed;

  if (allPassed) {
    console.log('\n✅ Core Primitives Test PASSED');
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main();
