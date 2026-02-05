/**
 * AI Gateway Module
 *
 * Epic A: Multi-LLM Gateway with advanced routing
 *
 * Features:
 * - Multi-provider support (OpenAI, Anthropic, Google, Azure, Bedrock)
 * - Load balancing strategies (round-robin, weighted, latency-based, cost-optimized)
 * - Circuit breaker for fault tolerance
 * - Automatic retries with exponential backoff
 * - Cost tracking and estimation
 * - Health monitoring
 */

// Types
export * from './types';

// Gateway
export { AIGateway, getGateway, resetGateway } from './gateway';

// Circuit Breaker
export {
  canMakeRequest,
  recordSuccess,
  recordFailure,
  getCircuitState,
  forceCircuitState,
  resetCircuit,
  getAllCircuitStates,
  withCircuitBreaker,
  CircuitOpenError,
} from './circuit-breaker';

// Load Balancer
export {
  selectProvider,
  getActiveConnections,
  incrementConnections,
  decrementConnections,
  recordLatency,
  getAverageLatency,
  getP95Latency,
  estimateCost,
  getProviderStats,
} from './load-balancer';

// Retry
export {
  withRetry,
  isRetryableError,
  calculateDelay,
  extractRetryAfter,
  createRetryWrapper,
  DEFAULT_RETRY_CONFIG,
} from './retry';

// Policy Router
export type { PolicyDecision, PolicyRouterConfig } from './policy-router';
export { PolicyRouter, getPolicyRouter, resetPolicyRouter } from './policy-router';
