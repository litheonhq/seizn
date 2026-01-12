/**
 * Seizn Core Primitives - Shared Types
 *
 * 6 Shared Primitives (from Seizn 계획.txt):
 * 1. Tenant Model: org → project → environment
 * 2. Data Scope: namespace/collection/dataset (translatable)
 * 3. Policy: retention/PII/consent/delete
 * 4. Budget: latency_budget_ms, cost_budget, max_candidates, max_rerank_n
 * 5. Trace ID: Unified tracing across all seasons
 * 6. Usage Units: Common billing/limits format
 */

// ===========================================
// 1. Tenant Model
// ===========================================

export interface Organization {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings: OrganizationSettings;
  createdAt: string;
}

export interface OrganizationSettings {
  defaultEnvironment: 'production' | 'staging' | 'development';
  enabledSeasons: ('spring' | 'summer' | 'fall' | 'winter')[];
  billingEmail?: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  settings: ProjectSettings;
  createdAt: string;
}

export interface ProjectSettings {
  defaultPolicyId?: string;
  enableFederated: boolean;
  enableAutopilot: boolean;
}

export type EnvironmentType = 'production' | 'staging' | 'development';

export interface Environment {
  id: string;
  projectId: string;
  type: EnvironmentType;
  apiKeyPrefix: string; // e.g., "szn_prod_", "szn_stg_"
  settings: EnvironmentSettings;
}

export interface EnvironmentSettings {
  rateLimits: RateLimits;
  budgetDefaults: BudgetConfig;
}

export interface RateLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
}

// ===========================================
// 2. Data Scope
// ===========================================

/**
 * Unified data scope that maps across seasons:
 * - Spring: namespace (memory scope)
 * - Summer: collection (document scope)
 * - Fall: dataset (eval scope)
 */
export interface DataScope {
  /** Spring: namespace, Summer: collection_id, Fall: dataset_id */
  id: string;
  /** Unified name across seasons */
  name: string;
  /** Original season-specific type */
  sourceType: 'namespace' | 'collection' | 'dataset';
  /** Owner */
  userId: string;
  /** Project context */
  projectId?: string;
  /** Environment context */
  environmentId?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

export interface DataScopeMapping {
  scopeId: string;
  springNamespace?: string;
  summerCollectionId?: string;
  fallDatasetId?: string;
}

// ===========================================
// 3. Policy
// ===========================================

export type PolicyType = 'retention' | 'pii' | 'consent' | 'delete' | 'access';

export interface Policy {
  id: string;
  name: string;
  type: PolicyType;
  scope: 'global' | 'organization' | 'project' | 'collection' | 'user';
  scopeId?: string; // org/project/collection/user ID
  config: PolicyConfig;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyConfig {
  // Retention policy
  ttlDays?: number;
  recencyHalfLifeDays?: number;

  // PII policy
  piiAction?: 'mask' | 'redact' | 'block' | 'warn';
  piiTypes?: string[];
  storeText?: boolean;

  // Consent policy
  requireExplicitConsent?: boolean;
  consentPurposes?: string[];

  // Delete policy
  softDeleteDays?: number;
  hardDeleteOnRequest?: boolean;

  // Access policy
  allowedRoles?: string[];
  ipWhitelist?: string[];
}

// ===========================================
// 4. Budget (Guardrails)
// ===========================================

export interface BudgetConfig {
  /** Maximum latency in milliseconds */
  latencyBudgetMs: number;
  /** Maximum cost per request (in credits) */
  costBudget: number;
  /** Maximum candidates to retrieve */
  maxCandidates: number;
  /** Maximum documents to rerank */
  maxRerankN: number;
  /** Maximum tokens in context */
  maxContextTokens: number;
  /** Concurrent request limit */
  maxConcurrentRequests: number;
}

export interface RequestBudget {
  /** Inherited from environment or override per request */
  latencyBudgetMs?: number;
  costBudget?: number;
  maxCandidates?: number;
  maxRerankN?: number;
  maxContextTokens?: number;
}

export interface BudgetUsage {
  requestId: string;
  allocatedBudget: BudgetConfig;
  actualUsage: {
    latencyMs: number;
    costCredits: number;
    candidatesRetrieved: number;
    documentsReranked: number;
    contextTokens: number;
  };
  withinBudget: boolean;
  violations: string[];
}

// ===========================================
// 5. Trace ID
// ===========================================

export interface TraceContext {
  /** Unique trace ID for the entire request */
  traceId: string;
  /** Span ID for the current operation */
  spanId: string;
  /** Parent span ID (if nested) */
  parentSpanId?: string;
  /** Sampling decision */
  sampled: boolean;
  /** Baggage items (key-value pairs propagated across services) */
  baggage: Record<string, string>;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  service: 'spring' | 'summer' | 'fall' | 'winter' | 'core';
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: 'ok' | 'error' | 'timeout';
  tags: Record<string, string | number | boolean>;
  logs: TraceLog[];
}

export interface TraceLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, unknown>;
}

// ===========================================
// 6. Usage Units
// ===========================================

export type UsageUnit =
  | 'api_call'
  | 'embedding_token'
  | 'search_query'
  | 'rerank_document'
  | 'storage_mb'
  | 'memory_operation'
  | 'eval_run';

export interface UsageRecord {
  id: string;
  userId: string;
  organizationId?: string;
  projectId?: string;
  environmentId?: string;

  /** Usage type */
  unit: UsageUnit;
  /** Quantity consumed */
  quantity: number;
  /** Associated cost in credits */
  costCredits: number;

  /** Season that generated this usage */
  season: 'spring' | 'summer' | 'fall' | 'winter';
  /** Specific operation */
  operation: string;

  /** Request context */
  traceId?: string;
  requestId?: string;

  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  period: 'hour' | 'day' | 'week' | 'month';
  startTime: string;
  endTime: string;

  totalCalls: number;
  totalCredits: number;

  byUnit: Record<UsageUnit, { quantity: number; credits: number }>;
  bySeason: Record<string, { quantity: number; credits: number }>;
  byOperation: Record<string, { quantity: number; credits: number }>;
}

export interface UsageLimit {
  unit: UsageUnit;
  limit: number;
  period: 'minute' | 'hour' | 'day' | 'month';
  current: number;
  remaining: number;
  resetAt: string;
}

// ===========================================
// Request Context (combines all primitives)
// ===========================================

export interface SeiznRequestContext {
  /** Tenant context */
  userId: string;
  organizationId?: string;
  projectId?: string;
  environment: EnvironmentType;

  /** API key info */
  apiKeyId: string;
  plan: string;

  /** Tracing */
  trace: TraceContext;

  /** Budget for this request */
  budget: RequestBudget;

  /** Active policies */
  policies: Policy[];

  /** Rate limit headers to return */
  rateLimitHeaders?: Record<string, string>;
}
