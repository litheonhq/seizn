/**
 * Circuit Breaker Implementation
 *
 * Prevents cascading failures by temporarily disabling unhealthy providers
 */

import type {
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitState,
} from './types';

// Default configuration
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000, // 30 seconds
  volumeThreshold: 10,
};

// In-memory circuit breaker states
const circuitStates = new Map<string, CircuitBreakerState>();

/**
 * Get or initialize circuit breaker state
 */
export function getCircuitState(providerId: string): CircuitBreakerState {
  if (!circuitStates.has(providerId)) {
    circuitStates.set(providerId, {
      state: 'closed',
      failures: 0,
      successes: 0,
    });
  }
  return circuitStates.get(providerId)!;
}

/**
 * Check if circuit allows request
 */
export function canMakeRequest(
  providerId: string,
  config: Partial<CircuitBreakerConfig> = {}
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = getCircuitState(providerId);

  switch (state.state) {
    case 'closed':
      return true;

    case 'open':
      // Check if timeout has passed
      if (state.nextRetryAt && new Date() >= state.nextRetryAt) {
        // Transition to half-open
        transitionTo(providerId, 'half-open');
        return true;
      }
      return false;

    case 'half-open':
      // Allow limited requests in half-open state
      return true;

    default:
      return true;
  }
}

/**
 * Record successful request
 */
export function recordSuccess(
  providerId: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = getCircuitState(providerId);

  state.successes++;
  state.lastSuccess = new Date();

  if (state.state === 'half-open') {
    if (state.successes >= cfg.successThreshold) {
      // Transition back to closed
      transitionTo(providerId, 'closed');
    }
  } else if (state.state === 'closed') {
    // Reset failure count on success
    state.failures = 0;
  }
}

/**
 * Record failed request
 */
export function recordFailure(
  providerId: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = getCircuitState(providerId);

  state.failures++;
  state.lastFailure = new Date();

  if (state.state === 'half-open') {
    // Any failure in half-open state opens the circuit
    transitionTo(providerId, 'open', cfg.timeout);
  } else if (state.state === 'closed') {
    if (state.failures >= cfg.failureThreshold) {
      transitionTo(providerId, 'open', cfg.timeout);
    }
  }
}

/**
 * Transition circuit to new state
 */
function transitionTo(
  providerId: string,
  newState: CircuitState,
  timeout?: number
): void {
  const state = getCircuitState(providerId);
  const previousState = state.state;

  state.state = newState;

  if (newState === 'open' && timeout) {
    state.nextRetryAt = new Date(Date.now() + timeout);
  }

  if (newState === 'closed') {
    state.failures = 0;
    state.successes = 0;
    state.nextRetryAt = undefined;
  }

  if (newState === 'half-open') {
    state.successes = 0;
  }

  console.log(
    `[CircuitBreaker] Provider ${providerId}: ${previousState} -> ${newState}`
  );
}

/**
 * Force circuit state (for admin/testing)
 */
export function forceCircuitState(
  providerId: string,
  newState: CircuitState
): void {
  transitionTo(providerId, newState);
}

/**
 * Reset circuit breaker
 */
export function resetCircuit(providerId: string): void {
  circuitStates.delete(providerId);
}

/**
 * Get all circuit states
 */
export function getAllCircuitStates(): Map<string, CircuitBreakerState> {
  return new Map(circuitStates);
}

/**
 * Create circuit breaker wrapper for async functions
 */
export function withCircuitBreaker<T>(
  providerId: string,
  fn: () => Promise<T>,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  if (!canMakeRequest(providerId, config)) {
    return Promise.reject(new CircuitOpenError(providerId));
  }

  return fn()
    .then((result) => {
      recordSuccess(providerId, config);
      return result;
    })
    .catch((error) => {
      recordFailure(providerId, config);
      throw error;
    });
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  public readonly providerId: string;
  public readonly retryAfter?: Date;

  constructor(providerId: string) {
    const state = getCircuitState(providerId);
    super(`Circuit breaker open for provider: ${providerId}`);
    this.name = 'CircuitOpenError';
    this.providerId = providerId;
    this.retryAfter = state.nextRetryAt;
  }
}
