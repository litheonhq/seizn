/**
 * Dynamic Sampling Strategy for Flight Recorder
 *
 * Implements adaptive sampling based on:
 * - Tenant tier (enterprise = 100%, free = 10%)
 * - Error rate (sample more when errors occur)
 * - P95 latency (sample more when responses are slow)
 */

// ============================================
// Types & Configuration
// ============================================

export type TenantTier = 'enterprise' | 'pro' | 'plus' | 'starter' | 'free';

export interface SamplingConfig {
  /** Base sampling rates by tenant tier */
  tierRates: Record<TenantTier, number>;

  /** Error rate sampling boost configuration */
  errorBoost: {
    /** Enable error-based sampling boost */
    enabled: boolean;
    /** Window size for error rate calculation (in seconds) */
    windowSizeSeconds: number;
    /** Error rate threshold to trigger boost (0.0 - 1.0) */
    errorRateThreshold: number;
    /** Multiplier when error rate exceeds threshold */
    boostMultiplier: number;
    /** Maximum sampling rate after boost */
    maxRate: number;
  };

  /** Latency-based sampling boost configuration */
  latencyBoost: {
    /** Enable latency-based sampling boost */
    enabled: boolean;
    /** P95 latency threshold in ms to trigger boost */
    p95ThresholdMs: number;
    /** Window size for latency calculation (in seconds) */
    windowSizeSeconds: number;
    /** Multiplier when P95 exceeds threshold */
    boostMultiplier: number;
    /** Maximum sampling rate after boost */
    maxRate: number;
  };

  /** Minimum sampling rate (floor) */
  minRate: number;

  /** Maximum sampling rate (ceiling) */
  maxRate: number;

  /** Force sample specific request IDs (for debugging) */
  forceSampleRequestIds: Set<string>;

  /** Force sample specific user IDs (for enterprise support) */
  forceSampleUserIds: Set<string>;
}

export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  tierRates: {
    enterprise: 1.0,
    pro: 0.5,
    plus: 0.25,
    starter: 0.15,
    free: 0.1,
  },
  errorBoost: {
    enabled: true,
    windowSizeSeconds: 60,
    errorRateThreshold: 0.05, // 5% error rate
    boostMultiplier: 3.0,
    maxRate: 1.0,
  },
  latencyBoost: {
    enabled: true,
    p95ThresholdMs: 2000, // 2 seconds
    windowSizeSeconds: 60,
    boostMultiplier: 2.0,
    maxRate: 0.8,
  },
  minRate: 0.01, // Always sample at least 1%
  maxRate: 1.0,
  forceSampleRequestIds: new Set(),
  forceSampleUserIds: new Set(),
};

// ============================================
// Metrics Tracking (In-Memory Rolling Window)
// ============================================

interface MetricsSample {
  timestamp: number;
  isError: boolean;
  latencyMs: number;
}

interface MetricsWindow {
  samples: MetricsSample[];
  lastCleanup: number;
}

// Global metrics storage (per-user for tenant isolation)
const metricsStore = new Map<string, MetricsWindow>();

function getMetricsWindow(userId: string): MetricsWindow {
  let window = metricsStore.get(userId);
  if (!window) {
    window = { samples: [], lastCleanup: Date.now() };
    metricsStore.set(userId, window);
  }
  return window;
}

/**
 * Record a sample for metrics tracking
 */
export function recordMetricsSample(
  userId: string,
  isError: boolean,
  latencyMs: number,
  config: Partial<SamplingConfig> = {}
): void {
  const cfg = { ...DEFAULT_SAMPLING_CONFIG, ...config };
  const window = getMetricsWindow(userId);
  const now = Date.now();

  // Add new sample
  window.samples.push({
    timestamp: now,
    isError,
    latencyMs,
  });

  // Cleanup old samples (run every 10 seconds)
  const maxWindowMs = Math.max(
    cfg.errorBoost.windowSizeSeconds,
    cfg.latencyBoost.windowSizeSeconds
  ) * 1000;

  if (now - window.lastCleanup > 10_000) {
    const cutoff = now - maxWindowMs;
    window.samples = window.samples.filter((s) => s.timestamp >= cutoff);
    window.lastCleanup = now;
  }

  // Prevent unbounded growth
  if (window.samples.length > 10_000) {
    window.samples = window.samples.slice(-5000);
  }
}

/**
 * Calculate current error rate for a user
 */
export function getErrorRate(
  userId: string,
  windowSizeSeconds: number = 60
): number {
  const window = getMetricsWindow(userId);
  const now = Date.now();
  const cutoff = now - windowSizeSeconds * 1000;

  const recentSamples = window.samples.filter((s) => s.timestamp >= cutoff);
  if (recentSamples.length === 0) return 0;

  const errorCount = recentSamples.filter((s) => s.isError).length;
  return errorCount / recentSamples.length;
}

/**
 * Calculate P95 latency for a user
 */
export function getP95Latency(
  userId: string,
  windowSizeSeconds: number = 60
): number {
  const window = getMetricsWindow(userId);
  const now = Date.now();
  const cutoff = now - windowSizeSeconds * 1000;

  const recentSamples = window.samples.filter((s) => s.timestamp >= cutoff);
  if (recentSamples.length === 0) return 0;

  const latencies = recentSamples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  return latencies[Math.min(p95Index, latencies.length - 1)];
}

/**
 * Get current metrics summary for a user
 */
export function getMetricsSummary(
  userId: string,
  config: Partial<SamplingConfig> = {}
): {
  errorRate: number;
  p95LatencyMs: number;
  sampleCount: number;
} {
  const cfg = { ...DEFAULT_SAMPLING_CONFIG, ...config };
  return {
    errorRate: getErrorRate(userId, cfg.errorBoost.windowSizeSeconds),
    p95LatencyMs: getP95Latency(userId, cfg.latencyBoost.windowSizeSeconds),
    sampleCount: getMetricsWindow(userId).samples.length,
  };
}

/**
 * Clear metrics for a user (for testing)
 */
export function clearMetrics(userId?: string): void {
  if (userId) {
    metricsStore.delete(userId);
  } else {
    metricsStore.clear();
  }
}

// ============================================
// Sampling Decision
// ============================================

export interface SamplingDecision {
  /** Whether to sample this request */
  sampled: boolean;
  /** Final computed sampling rate */
  rate: number;
  /** Reason for the decision */
  reason: SamplingReason;
  /** Debug info for tracing */
  debug?: {
    baseRate: number;
    errorRate?: number;
    errorBoostApplied?: boolean;
    p95LatencyMs?: number;
    latencyBoostApplied?: boolean;
    finalRate: number;
  };
}

export type SamplingReason =
  | 'tier_rate'
  | 'error_boost'
  | 'latency_boost'
  | 'combined_boost'
  | 'force_sample_request'
  | 'force_sample_user'
  | 'min_rate'
  | 'max_rate';

/**
 * Normalize tier string to TenantTier type
 */
function normalizeTier(plan: string): TenantTier {
  const normalized = (plan ?? 'free').toLowerCase();
  if (normalized === 'enterprise') return 'enterprise';
  if (normalized === 'pro') return 'pro';
  if (normalized === 'plus') return 'plus';
  if (normalized === 'starter') return 'starter';
  return 'free';
}

/**
 * Calculate the dynamic sampling rate based on current conditions
 */
export function calculateSamplingRate(
  userId: string,
  plan: string,
  config: Partial<SamplingConfig> = {}
): { rate: number; reason: SamplingReason; debug: SamplingDecision['debug'] } {
  const cfg = { ...DEFAULT_SAMPLING_CONFIG, ...config };
  const tier = normalizeTier(plan);

  // Start with base rate for tier
  let rate = cfg.tierRates[tier] ?? cfg.tierRates.free;
  let reason: SamplingReason = 'tier_rate';

  const debug: SamplingDecision['debug'] = {
    baseRate: rate,
    finalRate: rate,
  };

  // Check error boost
  let errorBoostApplied = false;
  if (cfg.errorBoost.enabled) {
    const errorRate = getErrorRate(userId, cfg.errorBoost.windowSizeSeconds);
    debug.errorRate = errorRate;

    if (errorRate >= cfg.errorBoost.errorRateThreshold) {
      const boostedRate = Math.min(
        rate * cfg.errorBoost.boostMultiplier,
        cfg.errorBoost.maxRate
      );
      if (boostedRate > rate) {
        rate = boostedRate;
        reason = 'error_boost';
        errorBoostApplied = true;
      }
    }
    debug.errorBoostApplied = errorBoostApplied;
  }

  // Check latency boost
  let latencyBoostApplied = false;
  if (cfg.latencyBoost.enabled) {
    const p95 = getP95Latency(userId, cfg.latencyBoost.windowSizeSeconds);
    debug.p95LatencyMs = p95;

    if (p95 >= cfg.latencyBoost.p95ThresholdMs) {
      const boostedRate = Math.min(
        rate * cfg.latencyBoost.boostMultiplier,
        cfg.latencyBoost.maxRate
      );
      if (boostedRate > rate) {
        rate = boostedRate;
        reason = latencyBoostApplied ? 'combined_boost' : 'latency_boost';
        latencyBoostApplied = true;
      }
    }
    debug.latencyBoostApplied = latencyBoostApplied;
  }

  // Combined boost reason
  if (errorBoostApplied && latencyBoostApplied) {
    reason = 'combined_boost';
  }

  // Apply floor/ceiling
  if (rate < cfg.minRate) {
    rate = cfg.minRate;
    reason = 'min_rate';
  }
  if (rate > cfg.maxRate) {
    rate = cfg.maxRate;
    reason = 'max_rate';
  }

  debug.finalRate = rate;

  return { rate, reason, debug };
}

/**
 * Make a sampling decision for a request
 */
export function shouldSample(
  userId: string,
  requestId: string,
  plan: string,
  config: Partial<SamplingConfig> = {}
): SamplingDecision {
  const cfg = { ...DEFAULT_SAMPLING_CONFIG, ...config };

  // Check force sample conditions first
  if (cfg.forceSampleRequestIds.has(requestId)) {
    return {
      sampled: true,
      rate: 1.0,
      reason: 'force_sample_request',
    };
  }

  if (cfg.forceSampleUserIds.has(userId)) {
    return {
      sampled: true,
      rate: 1.0,
      reason: 'force_sample_user',
    };
  }

  // Calculate dynamic rate
  const { rate, reason, debug } = calculateSamplingRate(userId, plan, cfg);

  // Make probabilistic decision
  const sampled = Math.random() < rate;

  return {
    sampled,
    rate,
    reason,
    debug,
  };
}

// ============================================
// Sampling Configuration Builder
// ============================================

/**
 * Builder for creating custom sampling configurations
 */
export class SamplingConfigBuilder {
  private config: SamplingConfig;

  constructor(base?: Partial<SamplingConfig>) {
    this.config = { ...DEFAULT_SAMPLING_CONFIG, ...base };
  }

  /**
   * Set sampling rate for a specific tier
   */
  withTierRate(tier: TenantTier, rate: number): this {
    this.config.tierRates[tier] = Math.max(0, Math.min(1, rate));
    return this;
  }

  /**
   * Configure error-based sampling boost
   */
  withErrorBoost(options: Partial<SamplingConfig['errorBoost']>): this {
    this.config.errorBoost = { ...this.config.errorBoost, ...options };
    return this;
  }

  /**
   * Configure latency-based sampling boost
   */
  withLatencyBoost(options: Partial<SamplingConfig['latencyBoost']>): this {
    this.config.latencyBoost = { ...this.config.latencyBoost, ...options };
    return this;
  }

  /**
   * Disable error-based sampling boost
   */
  disableErrorBoost(): this {
    this.config.errorBoost.enabled = false;
    return this;
  }

  /**
   * Disable latency-based sampling boost
   */
  disableLatencyBoost(): this {
    this.config.latencyBoost.enabled = false;
    return this;
  }

  /**
   * Set global min/max rates
   */
  withRateLimits(minRate: number, maxRate: number): this {
    this.config.minRate = Math.max(0, minRate);
    this.config.maxRate = Math.min(1, maxRate);
    return this;
  }

  /**
   * Add request ID to force sample list
   */
  forceSampleRequest(requestId: string): this {
    this.config.forceSampleRequestIds.add(requestId);
    return this;
  }

  /**
   * Add user ID to force sample list
   */
  forceSampleUser(userId: string): this {
    this.config.forceSampleUserIds.add(userId);
    return this;
  }

  /**
   * Build the final configuration
   */
  build(): SamplingConfig {
    return { ...this.config };
  }
}

/**
 * Create a new sampling configuration builder
 */
export function createSamplingConfig(base?: Partial<SamplingConfig>): SamplingConfigBuilder {
  return new SamplingConfigBuilder(base);
}
