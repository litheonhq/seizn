/**
 * Load Balancer Implementation
 *
 * Distributes requests across multiple LLM providers
 */

import type {
  LoadBalancerStrategy,
  ProviderConfig,
  ProviderHealth,
  RoutingDecision,
} from './types';
import { canMakeRequest, getCircuitState } from './circuit-breaker';

// Track active connections per provider
const activeConnections = new Map<string, number>();

// Track round-robin index
let roundRobinIndex = 0;

// Track latency history for latency-based routing
const latencyHistory = new Map<string, number[]>();
const MAX_LATENCY_SAMPLES = 100;

// Model pricing (cost per 1M tokens)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-5-haiku': { input: 0.25, output: 1.25 },
  'claude-3-opus': { input: 15, output: 75 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
};

/**
 * Select best provider based on strategy
 */
export function selectProvider(
  providers: ProviderConfig[],
  strategy: LoadBalancerStrategy,
  model: string,
  healthStatus: Map<string, ProviderHealth>
): RoutingDecision | null {
  // Filter to enabled providers that support the model and have open circuits
  const eligibleProviders = providers.filter((p) => {
    if (!p.enabled) return false;
    if (!p.models.includes(model) && !p.models.includes('*')) return false;
    if (!canMakeRequest(p.id)) return false;

    const health = healthStatus.get(p.id);
    if (health && health.status === 'unhealthy') return false;

    return true;
  });

  if (eligibleProviders.length === 0) {
    return null;
  }

  // Sort by priority first
  eligibleProviders.sort((a, b) => a.priority - b.priority);

  let selectedProvider: ProviderConfig;
  let reason: string;

  switch (strategy) {
    case 'round-robin':
      selectedProvider = selectRoundRobin(eligibleProviders);
      reason = 'Round-robin selection';
      break;

    case 'weighted':
      selectedProvider = selectWeighted(eligibleProviders);
      reason = `Weighted selection (weight: ${selectedProvider.weight})`;
      break;

    case 'least-connections':
      selectedProvider = selectLeastConnections(eligibleProviders);
      reason = `Least connections (${getActiveConnections(selectedProvider.id)} active)`;
      break;

    case 'latency-based':
      selectedProvider = selectLatencyBased(eligibleProviders);
      reason = `Lowest latency (${getAverageLatency(selectedProvider.id).toFixed(0)}ms)`;
      break;

    case 'cost-optimized':
      selectedProvider = selectCostOptimized(eligibleProviders, model);
      reason = 'Lowest cost provider';
      break;

    case 'failover':
    default:
      selectedProvider = selectFailover(eligibleProviders);
      reason = `Primary provider (priority: ${selectedProvider.priority})`;
      break;
  }

  // Build alternates list
  const alternates = eligibleProviders
    .filter((p) => p.id !== selectedProvider.id)
    .slice(0, 3)
    .map((p) => ({
      providerId: p.id,
      provider: p.provider,
      reason: `Fallback (priority: ${p.priority})`,
    }));

  return {
    providerId: selectedProvider.id,
    provider: selectedProvider.provider,
    model,
    reason,
    alternates,
  };
}

/**
 * Round-robin selection
 */
function selectRoundRobin(providers: ProviderConfig[]): ProviderConfig {
  const index = roundRobinIndex % providers.length;
  roundRobinIndex++;
  return providers[index];
}

/**
 * Weighted selection
 */
function selectWeighted(providers: ProviderConfig[]): ProviderConfig {
  const totalWeight = providers.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const provider of providers) {
    random -= provider.weight;
    if (random <= 0) {
      return provider;
    }
  }

  return providers[0];
}

/**
 * Least connections selection
 */
function selectLeastConnections(providers: ProviderConfig[]): ProviderConfig {
  return providers.reduce((best, current) => {
    const bestConnections = getActiveConnections(best.id);
    const currentConnections = getActiveConnections(current.id);
    return currentConnections < bestConnections ? current : best;
  });
}

/**
 * Latency-based selection
 */
function selectLatencyBased(providers: ProviderConfig[]): ProviderConfig {
  return providers.reduce((best, current) => {
    const bestLatency = getAverageLatency(best.id);
    const currentLatency = getAverageLatency(current.id);
    return currentLatency < bestLatency ? current : best;
  });
}

/**
 * Cost-optimized selection
 */
function selectCostOptimized(
  providers: ProviderConfig[],
  model: string
): ProviderConfig {
  return providers.reduce((best, current) => {
    const bestCost = getModelCost(model, best.provider);
    const currentCost = getModelCost(model, current.provider);
    return currentCost < bestCost ? current : best;
  });
}

/**
 * Failover selection (priority-based)
 */
function selectFailover(providers: ProviderConfig[]): ProviderConfig {
  // Already sorted by priority
  return providers[0];
}

/**
 * Get active connections for a provider
 */
export function getActiveConnections(providerId: string): number {
  return activeConnections.get(providerId) || 0;
}

/**
 * Increment active connections
 */
export function incrementConnections(providerId: string): void {
  const current = activeConnections.get(providerId) || 0;
  activeConnections.set(providerId, current + 1);
}

/**
 * Decrement active connections
 */
export function decrementConnections(providerId: string): void {
  const current = activeConnections.get(providerId) || 0;
  activeConnections.set(providerId, Math.max(0, current - 1));
}

/**
 * Record latency for provider
 */
export function recordLatency(providerId: string, latencyMs: number): void {
  if (!latencyHistory.has(providerId)) {
    latencyHistory.set(providerId, []);
  }

  const history = latencyHistory.get(providerId)!;
  history.push(latencyMs);

  // Keep only recent samples
  if (history.length > MAX_LATENCY_SAMPLES) {
    history.shift();
  }
}

/**
 * Get average latency for provider
 */
export function getAverageLatency(providerId: string): number {
  const history = latencyHistory.get(providerId);
  if (!history || history.length === 0) {
    return Infinity; // Unknown latency
  }

  return history.reduce((a, b) => a + b, 0) / history.length;
}

/**
 * Get p95 latency for provider
 */
export function getP95Latency(providerId: string): number {
  const history = latencyHistory.get(providerId);
  if (!history || history.length === 0) {
    return Infinity;
  }

  const sorted = [...history].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.95);
  return sorted[index] || sorted[sorted.length - 1];
}

/**
 * Get model cost estimate
 */
function getModelCost(model: string, provider: string): number {
  const cost = MODEL_COSTS[model];
  if (cost) {
    return (cost.input + cost.output) / 2; // Average of input/output
  }
  return Infinity; // Unknown cost
}

/**
 * Calculate estimated cost for a request
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const cost = MODEL_COSTS[model];
  if (!cost) return 0;

  const inputCost = (inputTokens / 1_000_000) * cost.input;
  const outputCost = (outputTokens / 1_000_000) * cost.output;

  return inputCost + outputCost;
}

/**
 * Get all provider stats
 */
export function getProviderStats(): Map<
  string,
  {
    activeConnections: number;
    avgLatency: number;
    p95Latency: number;
  }
> {
  const stats = new Map();

  for (const [providerId] of latencyHistory) {
    stats.set(providerId, {
      activeConnections: getActiveConnections(providerId),
      avgLatency: getAverageLatency(providerId),
      p95Latency: getP95Latency(providerId),
    });
  }

  return stats;
}
