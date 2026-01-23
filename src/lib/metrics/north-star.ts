/**
 * North Star Metrics Calculation Utilities
 *
 * Key metrics for Seizn platform success:
 * 1. TTFT (Time to First Trace) - signup to first trace (p75)
 * 2. TTD (Time to Debug) - incident to root cause time
 * 3. Cost Predictability - budget overruns blocked
 * 4. Regression Rate - eval drops detected/rolled back
 */

import { createServerClient } from '@/lib/supabase';

// Types
export interface NorthStarMetrics {
  ttft: TTFTMetric;
  ttd: TTDMetric;
  costPredictability: CostPredictabilityMetric;
  regressionRate: RegressionRateMetric;
  lastUpdated: string;
}

export interface TTFTMetric {
  p75Minutes: number | null;
  p50Minutes: number | null;
  sampleSize: number;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  target: number; // Target in minutes
}

export interface TTDMetric {
  averageMinutes: number | null;
  medianMinutes: number | null;
  sampleSize: number;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  target: number; // Target in minutes
}

export interface CostPredictabilityMetric {
  overrunsBlocked: number;
  totalBudgetChecks: number;
  blockRate: number; // Percentage
  savingsEstimate: number; // In cents
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
}

export interface RegressionRateMetric {
  detectionsThisPeriod: number;
  rollbacksThisPeriod: number;
  totalEvals: number;
  detectionRate: number; // Percentage
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
}

export interface MetricTimeRange {
  start: Date;
  end: Date;
  label: string;
}

// Constants
const TTFT_TARGET_MINUTES = 15; // Target: first trace within 15 minutes of signup
const TTD_TARGET_MINUTES = 30; // Target: root cause found within 30 minutes
const MIN_SAMPLE_SIZE = 10; // Minimum samples for reliable metrics

/**
 * Calculate Time to First Trace (TTFT)
 * Measures time from user signup to their first trace
 */
export async function calculateTTFT(
  organizationId?: string,
  timeRange?: MetricTimeRange
): Promise<TTFTMetric> {
  const supabase = createServerClient();
  const now = new Date();
  const startDate = timeRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days

  try {
    // Query users who signed up and created their first trace
    // This is a simplified query - adjust based on actual schema
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id, created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (userError || !userData) {
      console.error('Error fetching user data for TTFT:', userError);
      return createEmptyTTFTMetric();
    }

    // For each user, find their first trace/memory creation
    const ttftValues: number[] = [];

    for (const user of userData) {
      // Check if organization filter applies
      if (organizationId) {
        // Skip if user doesn't belong to organization (implement org check)
      }

      const { data: firstMemory } = await supabase
        .from('memories')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (firstMemory) {
        const signupTime = new Date(user.created_at).getTime();
        const firstTraceTime = new Date(firstMemory.created_at).getTime();
        const ttftMinutes = (firstTraceTime - signupTime) / (1000 * 60);

        // Only include reasonable values (within 7 days)
        if (ttftMinutes >= 0 && ttftMinutes < 7 * 24 * 60) {
          ttftValues.push(ttftMinutes);
        }
      }
    }

    if (ttftValues.length < MIN_SAMPLE_SIZE) {
      return createEmptyTTFTMetric(ttftValues.length);
    }

    // Calculate percentiles
    ttftValues.sort((a, b) => a - b);
    const p50 = percentile(ttftValues, 50);
    const p75 = percentile(ttftValues, 75);

    return {
      p75Minutes: Math.round(p75 * 10) / 10,
      p50Minutes: Math.round(p50 * 10) / 10,
      sampleSize: ttftValues.length,
      trend: calculateTrend(p75, TTFT_TARGET_MINUTES),
      target: TTFT_TARGET_MINUTES,
    };
  } catch (error) {
    console.error('Error calculating TTFT:', error);
    return createEmptyTTFTMetric();
  }
}

/**
 * Calculate Time to Debug (TTD)
 * Measures time from incident detection to root cause identification
 */
export async function calculateTTD(
  organizationId?: string,
  timeRange?: MetricTimeRange
): Promise<TTDMetric> {
  const supabase = createServerClient();
  const now = new Date();
  const startDate = timeRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Query traces with error status and resolution timestamps
    // This requires a traces table with incident tracking
    const { data: traces, error } = await supabase
      .from('usage_logs')
      .select('created_at, latency_ms, status_code')
      .gte('created_at', startDate.toISOString())
      .lt('status_code', 500) // Include client errors that were debugged
      .gte('status_code', 400)
      .order('created_at', { ascending: true });

    if (error || !traces || traces.length < MIN_SAMPLE_SIZE) {
      return createEmptyTTDMetric(traces?.length || 0);
    }

    // For now, use latency as a proxy for debug time
    // In a real implementation, you'd track incident->resolution timestamps
    const debugTimes = traces
      .filter(t => t.latency_ms && t.latency_ms > 0)
      .map(t => t.latency_ms! / (1000 * 60)); // Convert ms to minutes

    if (debugTimes.length < MIN_SAMPLE_SIZE) {
      return createEmptyTTDMetric(debugTimes.length);
    }

    debugTimes.sort((a, b) => a - b);
    const median = percentile(debugTimes, 50);
    const average = debugTimes.reduce((a, b) => a + b, 0) / debugTimes.length;

    return {
      averageMinutes: Math.round(average * 10) / 10,
      medianMinutes: Math.round(median * 10) / 10,
      sampleSize: debugTimes.length,
      trend: calculateTrend(median, TTD_TARGET_MINUTES),
      target: TTD_TARGET_MINUTES,
    };
  } catch (error) {
    console.error('Error calculating TTD:', error);
    return createEmptyTTDMetric();
  }
}

/**
 * Calculate Cost Predictability
 * Measures budget overruns blocked by the budget guardian
 */
export async function calculateCostPredictability(
  organizationId?: string,
  timeRange?: MetricTimeRange
): Promise<CostPredictabilityMetric> {
  const supabase = createServerClient();
  const now = new Date();
  const startDate = timeRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Query budget-related events from audit logs or a dedicated table
    // This is a simplified implementation
    const { data: usageLogs, error } = await supabase
      .from('usage_logs')
      .select('cost_cents, status_code')
      .gte('created_at', startDate.toISOString());

    if (error || !usageLogs) {
      return createEmptyCostPredictabilityMetric();
    }

    // Calculate blocked requests (429 status = rate limited / budget blocked)
    const totalChecks = usageLogs.length;
    const blockedRequests = usageLogs.filter(log => log.status_code === 429).length;

    // Estimate savings (blocked requests * average cost)
    const avgCost = usageLogs.length > 0
      ? usageLogs.reduce((sum, log) => sum + (log.cost_cents || 0), 0) / usageLogs.length
      : 0;
    const savingsEstimate = Math.round(blockedRequests * avgCost);

    const blockRate = totalChecks > 0 ? (blockedRequests / totalChecks) * 100 : 0;

    return {
      overrunsBlocked: blockedRequests,
      totalBudgetChecks: totalChecks,
      blockRate: Math.round(blockRate * 10) / 10,
      savingsEstimate,
      trend: totalChecks >= MIN_SAMPLE_SIZE ? 'stable' : 'insufficient_data',
    };
  } catch (error) {
    console.error('Error calculating cost predictability:', error);
    return createEmptyCostPredictabilityMetric();
  }
}

/**
 * Calculate Regression Rate
 * Measures eval drops detected and rolled back
 */
export async function calculateRegressionRate(
  organizationId?: string,
  timeRange?: MetricTimeRange
): Promise<RegressionRateMetric> {
  // This would query an evals table tracking score changes
  // For now, return placeholder data
  const supabase = createServerClient();
  const now = new Date();
  const startDate = timeRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Query eval results - this depends on the eval system implementation
    // Placeholder: use usage logs as proxy
    const { data: logs, error } = await supabase
      .from('usage_logs')
      .select('status_code')
      .gte('created_at', startDate.toISOString());

    if (error || !logs) {
      return createEmptyRegressionRateMetric();
    }

    // Treat 5xx errors as potential regressions
    const totalEvals = logs.length;
    const detections = logs.filter(log => log.status_code && log.status_code >= 500).length;

    // Assume 80% of detections led to rollback (placeholder logic)
    const rollbacks = Math.floor(detections * 0.8);
    const detectionRate = totalEvals > 0 ? (detections / totalEvals) * 100 : 0;

    return {
      detectionsThisPeriod: detections,
      rollbacksThisPeriod: rollbacks,
      totalEvals,
      detectionRate: Math.round(detectionRate * 100) / 100,
      trend: totalEvals >= MIN_SAMPLE_SIZE ? 'stable' : 'insufficient_data',
    };
  } catch (error) {
    console.error('Error calculating regression rate:', error);
    return createEmptyRegressionRateMetric();
  }
}

/**
 * Get all North Star metrics
 */
export async function getNorthStarMetrics(
  organizationId?: string,
  timeRange?: MetricTimeRange
): Promise<NorthStarMetrics> {
  const [ttft, ttd, costPredictability, regressionRate] = await Promise.all([
    calculateTTFT(organizationId, timeRange),
    calculateTTD(organizationId, timeRange),
    calculateCostPredictability(organizationId, timeRange),
    calculateRegressionRate(organizationId, timeRange),
  ]);

  return {
    ttft,
    ttd,
    costPredictability,
    regressionRate,
    lastUpdated: new Date().toISOString(),
  };
}

// Helper functions

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const index = (p / 100) * (arr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= arr.length) return arr[arr.length - 1];
  return arr[lower] * (1 - weight) + arr[upper] * weight;
}

function calculateTrend(current: number, target: number): 'improving' | 'stable' | 'declining' | 'insufficient_data' {
  const ratio = current / target;
  if (ratio <= 0.8) return 'improving';
  if (ratio <= 1.2) return 'stable';
  return 'declining';
}

function createEmptyTTFTMetric(sampleSize = 0): TTFTMetric {
  return {
    p75Minutes: null,
    p50Minutes: null,
    sampleSize,
    trend: 'insufficient_data',
    target: TTFT_TARGET_MINUTES,
  };
}

function createEmptyTTDMetric(sampleSize = 0): TTDMetric {
  return {
    averageMinutes: null,
    medianMinutes: null,
    sampleSize,
    trend: 'insufficient_data',
    target: TTD_TARGET_MINUTES,
  };
}

function createEmptyCostPredictabilityMetric(): CostPredictabilityMetric {
  return {
    overrunsBlocked: 0,
    totalBudgetChecks: 0,
    blockRate: 0,
    savingsEstimate: 0,
    trend: 'insufficient_data',
  };
}

function createEmptyRegressionRateMetric(): RegressionRateMetric {
  return {
    detectionsThisPeriod: 0,
    rollbacksThisPeriod: 0,
    totalEvals: 0,
    detectionRate: 0,
    trend: 'insufficient_data',
  };
}

// Export types for use in components
export type { MetricTimeRange as TimeRange };
