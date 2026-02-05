/**
 * Search SLO (Service Level Objectives) Configuration and Compliance
 *
 * Defines latency, recall, MRR, and error-rate targets per tier (free, pro,
 * enterprise). The compliance checker compares observed SearchMetrics against
 * a SearchSLO and produces a pass/fail report per metric.
 *
 * Usage:
 *   import { DEFAULT_SLOS, checkSLOCompliance } from './search-slo';
 *   const report = checkSLOCompliance(observedMetrics, DEFAULT_SLOS.pro);
 *   if (!report.compliant) { alert(report.violations); }
 *
 * @module spring/memory-v4/search-slo
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Search SLO (Service Level Objectives) configuration.
 * All latency values are in milliseconds; rate/score values are 0-1.
 */
export interface SearchSLO {
  /** 50th-percentile (median) latency target */
  p50LatencyMs: number;
  /** 95th-percentile latency target */
  p95LatencyMs: number;
  /** 99th-percentile latency target */
  p99LatencyMs: number;
  /** Minimum acceptable Recall@10 */
  minRecallAt10: number;
  /** Minimum acceptable Mean Reciprocal Rank */
  minMRR: number;
  /** Maximum acceptable error rate (0-1) */
  maxErrorRate: number;
}

/**
 * Observed search metrics to evaluate against an SLO.
 * Latency percentiles are in milliseconds; rates/scores are 0-1.
 */
export interface SearchMetrics {
  /** Observed p50 latency in ms */
  p50LatencyMs: number;
  /** Observed p95 latency in ms */
  p95LatencyMs: number;
  /** Observed p99 latency in ms */
  p99LatencyMs: number;
  /** Observed Recall@10 (0-1) */
  recallAt10: number;
  /** Observed Mean Reciprocal Rank (0-1) */
  mrr: number;
  /** Observed error rate (0-1) */
  errorRate: number;
}

/**
 * Result of checking a single SLO metric.
 */
export interface SLOMetricResult {
  /** Human-readable metric name */
  metric: string;
  /** The SLO target value */
  target: number;
  /** The observed (actual) value */
  actual: number;
  /** Whether this metric passes the SLO */
  pass: boolean;
  /** How far off the actual is from the target (signed) */
  delta: number;
  /** Direction of comparison: 'at_most' (latency/error) or 'at_least' (recall/mrr) */
  direction: 'at_most' | 'at_least';
}

/**
 * Full SLO compliance report.
 */
export interface SLOReport {
  /** Whether all SLO metrics pass */
  compliant: boolean;
  /** Tier name, if provided */
  tier?: string;
  /** Timestamp of the check */
  checkedAt: string;
  /** Individual metric results */
  results: SLOMetricResult[];
  /** Subset of results that failed */
  violations: SLOMetricResult[];
  /** Number of metrics that passed */
  passCount: number;
  /** Number of metrics that failed */
  failCount: number;
}

// =============================================================================
// Default SLO Tiers
// =============================================================================

/**
 * Default SLOs for each pricing tier.
 *
 * - free:       Relaxed targets for free-tier users
 * - pro:        Moderate targets for paid users
 * - enterprise: Strict targets for enterprise deployments
 */
export const DEFAULT_SLOS: Record<string, SearchSLO> = {
  free: {
    p50LatencyMs: 500,
    p95LatencyMs: 2000,
    p99LatencyMs: 5000,
    minRecallAt10: 0.6,
    minMRR: 0.4,
    maxErrorRate: 0.05,
  },
  pro: {
    p50LatencyMs: 200,
    p95LatencyMs: 800,
    p99LatencyMs: 2000,
    minRecallAt10: 0.8,
    minMRR: 0.6,
    maxErrorRate: 0.01,
  },
  enterprise: {
    p50LatencyMs: 100,
    p95LatencyMs: 400,
    p99LatencyMs: 1000,
    minRecallAt10: 0.9,
    minMRR: 0.75,
    maxErrorRate: 0.005,
  },
};

// =============================================================================
// SLO Compliance Checker
// =============================================================================

/**
 * Check a single "at most" metric (lower is better, e.g. latency, error rate).
 */
function checkAtMost(
  metric: string,
  actual: number,
  target: number
): SLOMetricResult {
  return {
    metric,
    target,
    actual,
    pass: actual <= target,
    delta: actual - target,
    direction: 'at_most',
  };
}

/**
 * Check a single "at least" metric (higher is better, e.g. recall, MRR).
 */
function checkAtLeast(
  metric: string,
  actual: number,
  target: number
): SLOMetricResult {
  return {
    metric,
    target,
    actual,
    pass: actual >= target,
    delta: actual - target,
    direction: 'at_least',
  };
}

/**
 * Check whether observed search metrics comply with an SLO.
 *
 * Compares each metric in `metrics` against the corresponding target in `slo`
 * and returns a structured report with pass/fail per metric.
 *
 * @param metrics - Observed search performance metrics
 * @param slo     - The SLO to check against
 * @param tier    - Optional tier name for labelling the report
 * @returns SLOReport with compliance status and per-metric details
 */
export function checkSLOCompliance(
  metrics: SearchMetrics,
  slo: SearchSLO,
  tier?: string
): SLOReport {
  const results: SLOMetricResult[] = [
    // Latency targets (lower is better)
    checkAtMost('p50LatencyMs', metrics.p50LatencyMs, slo.p50LatencyMs),
    checkAtMost('p95LatencyMs', metrics.p95LatencyMs, slo.p95LatencyMs),
    checkAtMost('p99LatencyMs', metrics.p99LatencyMs, slo.p99LatencyMs),

    // Quality targets (higher is better)
    checkAtLeast('recallAt10', metrics.recallAt10, slo.minRecallAt10),
    checkAtLeast('mrr', metrics.mrr, slo.minMRR),

    // Error rate (lower is better)
    checkAtMost('errorRate', metrics.errorRate, slo.maxErrorRate),
  ];

  const violations = results.filter((r) => !r.pass);

  return {
    compliant: violations.length === 0,
    tier,
    checkedAt: new Date().toISOString(),
    results,
    violations,
    passCount: results.length - violations.length,
    failCount: violations.length,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format an SLO report as a human-readable summary string.
 */
export function formatSLOReport(report: SLOReport): string {
  const lines: string[] = [];

  const status = report.compliant ? 'PASS' : 'FAIL';
  const tierLabel = report.tier ? ` (${report.tier})` : '';
  lines.push(`=== SLO Compliance: ${status}${tierLabel} ===`);
  lines.push(`Checked: ${report.checkedAt}`);
  lines.push(`Metrics: ${report.passCount} passed, ${report.failCount} failed`);
  lines.push('');

  for (const r of report.results) {
    const icon = r.pass ? '[PASS]' : '[FAIL]';
    const dir = r.direction === 'at_most' ? '<=' : '>=';
    const deltaStr =
      r.delta >= 0
        ? `+${r.delta.toFixed(4)}`
        : r.delta.toFixed(4);
    lines.push(
      `  ${icon} ${r.metric}: actual=${r.actual} ${dir} target=${r.target} (delta=${deltaStr})`
    );
  }

  if (report.violations.length > 0) {
    lines.push('');
    lines.push('--- Violations ---');
    for (const v of report.violations) {
      lines.push(`  ${v.metric}: ${v.actual} vs target ${v.target}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get the SLO for a given tier name. Falls back to 'free' if the tier is
 * not recognized.
 */
export function getSLOForTier(tier: string): SearchSLO {
  return DEFAULT_SLOS[tier] ?? DEFAULT_SLOS.free;
}

/**
 * Check SLO compliance for a named tier (convenience wrapper).
 */
export function checkTierCompliance(
  metrics: SearchMetrics,
  tier: string
): SLOReport {
  const slo = getSLOForTier(tier);
  return checkSLOCompliance(metrics, slo, tier);
}
