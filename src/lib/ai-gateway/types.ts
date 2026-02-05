/**
 * AI Gateway Types
 *
 * Epic A: Multi-LLM Gateway with advanced routing
 */

// ============================================
// Provider Types
// ============================================

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'bedrock' | 'custom';

export interface ProviderConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  baseUrl?: string;
  apiKey?: string;
  models: string[];
  enabled: boolean;
  priority: number; // Lower = higher priority
  weight: number; // For weighted load balancing (0-100)
  maxConcurrent: number;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  timeout: number; // milliseconds
  retryConfig: RetryConfig;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

// ============================================
// Circuit Breaker Types
// ============================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes in half-open to close
  timeout: number; // Time in ms before transitioning from open to half-open
  volumeThreshold: number; // Minimum requests before evaluating
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  nextRetryAt?: Date;
}

// ============================================
// Load Balancer Types
// ============================================

export type LoadBalancerStrategy =
  | 'round-robin'
  | 'weighted'
  | 'least-connections'
  | 'latency-based'
  | 'cost-optimized'
  | 'failover';

export interface LoadBalancerConfig {
  strategy: LoadBalancerStrategy;
  healthCheckInterval: number; // milliseconds
  stickySession: boolean;
  sessionTTL: number; // milliseconds
}

// ============================================
// Request/Response Types
// ============================================

export interface ToolFunction {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface GatewayRequest {
  id: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  userId?: string;
  metadata?: Record<string, unknown>;
  preferredProvider?: LLMProvider;
  fallbackProviders?: LLMProvider[];
  timeout?: number;
  tools?: ToolFunction[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface GatewayResponse {
  id: string;
  requestId: string;
  provider: LLMProvider;
  model: string;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  cost: number;
  cached: boolean;
  metadata?: Record<string, unknown>;
}

export interface GatewayError {
  code: string;
  message: string;
  provider?: LLMProvider;
  retryable: boolean;
  details?: Record<string, unknown>;
}

// ============================================
// Health & Metrics Types
// ============================================

export interface ProviderHealth {
  providerId: string;
  provider: LLMProvider;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  errorRate: number;
  lastCheck: Date;
  activeRequests: number;
  circuitState: CircuitState;
}

export interface GatewayMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  requestsByProvider: Record<LLMProvider, number>;
  errorsByProvider: Record<LLMProvider, number>;
  periodStart: Date;
  periodEnd: Date;
}

// ============================================
// Routing Types
// ============================================

export interface RoutingDecision {
  providerId: string;
  provider: LLMProvider;
  model: string;
  reason: string;
  alternates: Array<{
    providerId: string;
    provider: LLMProvider;
    reason: string;
  }>;
}

export interface ModelMapping {
  requestedModel: string;
  providerMappings: Array<{
    provider: LLMProvider;
    providerId: string;
    model: string;
    priority: number;
  }>;
}

// ============================================
// Configuration Types
// ============================================

export interface GatewayConfig {
  providers: ProviderConfig[];
  loadBalancer: LoadBalancerConfig;
  circuitBreaker: CircuitBreakerConfig;
  defaultTimeout: number;
  maxRetries: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  costTracking: boolean;
  telemetryEnabled: boolean;
}

// ============================================
// Database Row Types
// ============================================

export interface ProviderConfigRow {
  id: string;
  user_id: string;
  org_id?: string;
  name: string;
  provider: LLMProvider;
  base_url?: string;
  api_key_encrypted?: string;
  models: string[];
  enabled: boolean;
  priority: number;
  weight: number;
  max_concurrent: number;
  rate_limit: {
    requests_per_minute: number;
    tokens_per_minute: number;
  };
  timeout_ms: number;
  retry_config: RetryConfig;
  created_at: string;
  updated_at: string;
}

export interface GatewayRequestLogRow {
  id: string;
  user_id: string;
  org_id?: string;
  provider_id: string;
  provider: LLMProvider;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost: number;
  status: 'success' | 'error' | 'timeout' | 'rate_limited';
  error_code?: string;
  error_message?: string;
  cached: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}
