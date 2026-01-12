/**
 * Seizn Core Primitives
 *
 * Shared infrastructure for all seasons:
 * 1. Tenant Model: org → project → environment
 * 2. Data Scope: namespace/collection/dataset (translatable)
 * 3. Policy: retention/PII/consent/delete
 * 4. Budget: latency_budget_ms, cost_budget, max_candidates, max_rerank_n
 * 5. Trace ID: Unified tracing across all seasons
 * 6. Usage Units: Common billing/limits format
 */

// Types
export * from './types';

// Budget management
export {
  getDefaultBudget,
  resolveBudget,
  checkBudget,
  estimateCost,
  applyBudgetLimits,
} from './budget';

// Trace context
export {
  generateTraceId,
  generateSpanId,
  shouldSample,
  createTraceContext,
  createChildContext,
  extractFromHeaders,
  injectToHeaders,
  createSpan,
  addSpanTag,
  addSpanLog,
  finishSpan,
  addSeiznBaggage,
} from './trace';

// Usage tracking
export {
  recordUsage,
  getUsageSummary,
  checkUsageLimits,
  isWithinLimits,
} from './usage';
