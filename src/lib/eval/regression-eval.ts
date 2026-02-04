/**
 * Regression Evaluation Module
 *
 * Detects regressions in policy effectiveness by comparing
 * current results against historical baselines.
 */

import { createClient } from '@/lib/supabase/server';
import type { EvalTestResult, EvalSeverity } from './types';

interface RegressionMetric {
  key: string;
  label: string;
  warningThreshold: number; // Percentage drop to warn (e.g., 0.02 = 2%)
  criticalThreshold: number; // Percentage drop to critical (e.g., 0.05 = 5%)
}

const REGRESSION_METRICS: RegressionMetric[] = [
  {
    key: 'detection_rate',
    label: 'Threat Detection Rate',
    warningThreshold: 0.02,
    criticalThreshold: 0.05,
  },
  {
    key: 'false_positive_rate',
    label: 'False Positive Rate',
    warningThreshold: 0.05, // Increase is bad
    criticalThreshold: 0.10,
  },
  {
    key: 'avg_latency_ms',
    label: 'Average Latency',
    warningThreshold: 0.20, // 20% increase
    criticalThreshold: 0.50, // 50% increase
  },
  {
    key: 'blocked_rate',
    label: 'Block Rate',
    warningThreshold: 0.03,
    criticalThreshold: 0.10,
  },
];

/**
 * Run regression checks for an organization
 */
export async function runRegressionCheck(
  organizationId: string,
  metadata: Record<string, unknown>
): Promise<EvalTestResult[]> {
  const results: EvalTestResult[] = [];
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Get the two most recent successful eval runs for comparison
    const { data: runs, error } = await supabase
      .from('auto_eval_runs')
      .select('id, summary, completed_at')
      .eq('organization_id', organizationId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(2);

    if (error) {
      throw new Error(`Failed to fetch eval history: ${error.message}`);
    }

    if (!runs || runs.length < 2) {
      results.push({
        testId: 'regression-baseline',
        testName: 'Baseline Check',
        suite: 'regression',
        status: 'skipped',
        severity: 'info',
        message: 'Not enough historical data for regression analysis (need at least 2 runs)',
        durationMs: Date.now() - startTime,
      });
      return results;
    }

    const [candidateRun, baselineRun] = runs;

    // Check each metric for regression
    for (const metric of REGRESSION_METRICS) {
      const result = checkMetricRegression(
        metric,
        baselineRun.summary,
        candidateRun.summary
      );
      results.push(result);
    }

    // Also check for new failure patterns
    const patternResult = await checkNewFailurePatterns(
      organizationId,
      baselineRun.id,
      candidateRun.id
    );
    if (patternResult) {
      results.push(patternResult);
    }
  } catch (error) {
    results.push({
      testId: 'regression-error',
      testName: 'Regression Analysis',
      suite: 'regression',
      status: 'error',
      severity: 'medium',
      message: error instanceof Error ? error.message : 'Regression check failed',
      durationMs: Date.now() - startTime,
    });
  }

  return results;
}

/**
 * Check a specific metric for regression
 */
function checkMetricRegression(
  metric: RegressionMetric,
  baseline: Record<string, unknown> | null,
  candidate: Record<string, unknown> | null
): EvalTestResult {
  const startTime = Date.now();

  if (!baseline || !candidate) {
    return {
      testId: `regression-${metric.key}`,
      testName: metric.label,
      suite: 'regression',
      status: 'skipped',
      severity: 'info',
      message: 'Missing baseline or candidate data',
      durationMs: Date.now() - startTime,
    };
  }

  const baselineValue = extractMetricValue(baseline, metric.key);
  const candidateValue = extractMetricValue(candidate, metric.key);

  if (baselineValue === null || candidateValue === null) {
    return {
      testId: `regression-${metric.key}`,
      testName: metric.label,
      suite: 'regression',
      status: 'skipped',
      severity: 'info',
      message: `Metric ${metric.key} not available in data`,
      durationMs: Date.now() - startTime,
    };
  }

  // Calculate regression (negative means worse performance)
  const delta = calculateDelta(metric.key, baselineValue, candidateValue);
  const severity = determineSeverity(delta, metric);

  const passed = severity === 'info' || severity === 'low';

  return {
    testId: `regression-${metric.key}`,
    testName: metric.label,
    suite: 'regression',
    status: passed ? 'passed' : 'failed',
    severity,
    message: passed
      ? `No significant regression detected (delta: ${formatDelta(delta)})`
      : `Regression detected: ${formatDelta(delta)} (threshold: ${metric.warningThreshold * 100}%)`,
    details: {
      baseline: baselineValue,
      candidate: candidateValue,
      delta,
      deltaPercent: delta * 100,
      warningThreshold: metric.warningThreshold,
      criticalThreshold: metric.criticalThreshold,
    },
    durationMs: Date.now() - startTime,
  };
}

/**
 * Check for new types of test failures not seen in baseline
 */
async function checkNewFailurePatterns(
  organizationId: string,
  baselineRunId: string,
  candidateRunId: string
): Promise<EvalTestResult | null> {
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Get failure details from both runs
    const { data: baselineRun } = await supabase
      .from('auto_eval_runs')
      .select('results')
      .eq('id', baselineRunId)
      .single();

    const { data: candidateRun } = await supabase
      .from('auto_eval_runs')
      .select('results')
      .eq('id', candidateRunId)
      .single();

    if (!baselineRun || !candidateRun) {
      return null;
    }

    const baselineFailures = new Set(
      (baselineRun.results || [])
        .filter((r: { status: string }) => r.status === 'failed')
        .map((r: { testId: string }) => r.testId)
    );

    const candidateFailures = (candidateRun.results || []).filter(
      (r: { status: string }) => r.status === 'failed'
    );

    const newFailures = candidateFailures.filter(
      (r: { testId: string }) => !baselineFailures.has(r.testId)
    );

    if (newFailures.length === 0) {
      return {
        testId: 'regression-new-failures',
        testName: 'New Failure Patterns',
        suite: 'regression',
        status: 'passed',
        severity: 'info',
        message: 'No new failure patterns detected',
        durationMs: Date.now() - startTime,
      };
    }

    return {
      testId: 'regression-new-failures',
      testName: 'New Failure Patterns',
      suite: 'regression',
      status: 'failed',
      severity: newFailures.length > 3 ? 'high' : 'medium',
      message: `${newFailures.length} new failure patterns detected`,
      details: {
        newFailureIds: newFailures.map((f: { testId: string }) => f.testId),
        newFailureCount: newFailures.length,
      },
      durationMs: Date.now() - startTime,
    };
  } catch {
    return null;
  }
}

// ============================================
// Helpers
// ============================================

function extractMetricValue(
  summary: Record<string, unknown>,
  key: string
): number | null {
  // Handle nested paths like 'summary.passed'
  const parts = key.split('.');
  let value: unknown = summary;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  if (typeof value === 'number') {
    return value;
  }

  // Try to calculate derived metrics
  if (key === 'detection_rate' && summary) {
    const passed = (summary as { passed?: number }).passed ?? 0;
    const total = (summary as { totalTests?: number }).totalTests ?? 0;
    return total > 0 ? passed / total : null;
  }

  return null;
}

function calculateDelta(
  metricKey: string,
  baseline: number,
  candidate: number
): number {
  if (baseline === 0) {
    return candidate > 0 ? 1 : 0;
  }

  // For metrics where increase is bad (latency, false positives)
  const invertedMetrics = ['avg_latency_ms', 'false_positive_rate'];

  if (invertedMetrics.includes(metricKey)) {
    // Positive delta means regression (got worse)
    return (candidate - baseline) / baseline;
  }

  // For metrics where decrease is bad (detection rate, block rate)
  // Negative delta means regression
  return (candidate - baseline) / baseline;
}

function determineSeverity(
  delta: number,
  metric: RegressionMetric
): EvalSeverity {
  const absDelta = Math.abs(delta);

  // For inverted metrics, positive delta is bad
  const invertedMetrics = ['avg_latency_ms', 'false_positive_rate'];
  const isRegression = invertedMetrics.includes(metric.key)
    ? delta > 0
    : delta < 0;

  if (!isRegression) {
    return 'info'; // Improvement or no change
  }

  if (absDelta >= metric.criticalThreshold) {
    return 'critical';
  }

  if (absDelta >= metric.warningThreshold) {
    return 'high';
  }

  return 'low';
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${(delta * 100).toFixed(2)}%`;
}
