/**
 * Seizn Winter - OPA (Open Policy Agent) Integration Types
 *
 * Type definitions for OPA/Rego policy evaluation including:
 * - Access control policies
 * - Data governance rules
 * - Rate limiting rules
 */

// ============================================
// Core OPA Types
// ============================================

/**
 * Policy decision result from OPA evaluation
 */
export interface OpaDecision {
  /** Whether the action is allowed */
  allow: boolean;

  /** Denial reason if not allowed */
  reason?: string;

  /** Additional conditions or restrictions */
  conditions?: PolicyCondition[];

  /** Metadata about the decision */
  metadata?: {
    policyId?: string;
    policyVersion?: number;
    evaluatedAt: string;
    evaluationTimeMs: number;
  };
}

/**
 * Condition applied to a decision
 */
export interface PolicyCondition {
  type: 'filter' | 'transform' | 'rate_limit' | 'audit';
  spec: Record<string, unknown>;
}

/**
 * Input context for policy evaluation
 */
export interface OpaInput {
  /** The principal (who is making the request) */
  principal: OpaPrincipal;

  /** The resource being accessed */
  resource?: OpaResource;

  /** The action being performed */
  action: OpaAction;

  /** Request context */
  context?: OpaContext;

  /** Additional data for evaluation */
  data?: Record<string, unknown>;
}

/**
 * Principal (subject) making the request
 */
export interface OpaPrincipal {
  type: 'user' | 'api_key' | 'service' | 'system';
  id: string;
  organizationId?: string;
  teamIds?: string[];
  roles?: string[];
  attributes?: Record<string, unknown>;
}

/**
 * Resource being accessed
 */
export interface OpaResource {
  type: OpaResourceType;
  id?: string;
  organizationId?: string;
  teamId?: string;
  ownerId?: string;
  attributes?: Record<string, unknown>;
}

/**
 * Types of resources that can be governed by policies
 */
export type OpaResourceType =
  | 'memory'
  | 'collection'
  | 'document'
  | 'trace'
  | 'api_key'
  | 'webhook'
  | 'organization'
  | 'team'
  | 'member'
  | 'policy'
  | 'report'
  | 'audit_log'
  | 'settings'
  | 'billing';

/**
 * Action being performed
 */
export interface OpaAction {
  operation: OpaOperation;
  method?: string;
  endpoint?: string;
}

/**
 * Operation types for policy evaluation
 */
export type OpaOperation =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'list'
  | 'search'
  | 'export'
  | 'import'
  | 'share'
  | 'admin';

/**
 * Request context for evaluation
 */
export interface OpaContext {
  /** Request timestamp */
  timestamp: string;

  /** Client IP address */
  ipAddress?: string;

  /** User agent */
  userAgent?: string;

  /** Request ID for tracing */
  requestId?: string;

  /** Geographic location (from IP) */
  geoLocation?: {
    country?: string;
    region?: string;
    city?: string;
  };

  /** Time-based context */
  time?: {
    hour: number;
    dayOfWeek: number;
    isWeekend: boolean;
    timezone?: string;
  };

  /** Rate limiting context */
  rateLimit?: {
    currentCount: number;
    windowStart: string;
    limit: number;
  };
}

// ============================================
// Rego Policy Storage Types
// ============================================

/**
 * Stored Rego policy
 */
export interface RegoPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;

  /** Policy category */
  category: RegoPolicyCategory;

  /** Rego policy code */
  regoCode: string;

  /** Compiled/parsed policy (for caching) */
  compiledPolicy?: Record<string, unknown>;

  /** Policy version */
  version: number;

  /** Whether this policy is active */
  isActive: boolean;

  /** Priority (higher = evaluated first) */
  priority: number;

  /** Scope of the policy */
  scope: RegoPolicyScope;

  /** Policy metadata */
  metadata?: {
    author?: string;
    tags?: string[];
    lastTestedAt?: string;
    testResults?: PolicyTestResult[];
  };

  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Policy categories
 */
export type RegoPolicyCategory =
  | 'access_control'
  | 'data_governance'
  | 'rate_limiting'
  | 'content_filter'
  | 'audit'
  | 'custom';

/**
 * Policy scope definition
 */
export interface RegoPolicyScope {
  /** Apply to all resources */
  all?: boolean;

  /** Apply to specific resource types */
  resourceTypes?: OpaResourceType[];

  /** Apply to specific teams */
  teamIds?: string[];

  /** Apply to specific users */
  userIds?: string[];

  /** Apply to specific operations */
  operations?: OpaOperation[];
}

/**
 * Policy test result
 */
export interface PolicyTestResult {
  testName: string;
  passed: boolean;
  input: OpaInput;
  expectedOutput: OpaDecision;
  actualOutput: OpaDecision;
  executedAt: string;
}

// ============================================
// Policy Evaluation Types
// ============================================

/**
 * Policy evaluation request
 */
export interface PolicyEvaluationRequest {
  /** Input for policy evaluation */
  input: OpaInput;

  /** Specific policy IDs to evaluate (optional, defaults to all active) */
  policyIds?: string[];

  /** Policy categories to evaluate */
  categories?: RegoPolicyCategory[];

  /** Whether to return all policy decisions or just the final one */
  includeAllDecisions?: boolean;

  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Policy evaluation response
 */
export interface PolicyEvaluationResponse {
  /** Final aggregated decision */
  decision: OpaDecision;

  /** Individual policy decisions (if requested) */
  policyDecisions?: {
    policyId: string;
    policyName: string;
    decision: OpaDecision;
  }[];

  /** Evaluation statistics */
  stats: {
    totalPoliciesEvaluated: number;
    evaluationTimeMs: number;
    cacheHit: boolean;
  };
}

// ============================================
// Rate Limiting Types
// ============================================

/**
 * Rate limit policy configuration
 */
export interface RateLimitPolicyConfig {
  /** Rate limit rules */
  rules: RateLimitRule[];

  /** Default limit if no rule matches */
  defaultLimit: RateLimitSpec;

  /** How to aggregate limits (per user, per org, per IP, etc.) */
  aggregation: RateLimitAggregation;
}

/**
 * Single rate limit rule
 */
export interface RateLimitRule {
  /** Rule name for identification */
  name: string;

  /** Condition to match (in Rego-like syntax) */
  condition: string;

  /** Rate limit specification */
  limit: RateLimitSpec;

  /** Priority (higher = evaluated first) */
  priority: number;
}

/**
 * Rate limit specification
 */
export interface RateLimitSpec {
  /** Maximum requests allowed */
  maxRequests: number;

  /** Time window in seconds */
  windowSeconds: number;

  /** Burst allowance (optional) */
  burst?: number;

  /** Penalty duration in seconds when limit exceeded */
  penaltySeconds?: number;
}

/**
 * Rate limit aggregation method
 */
export type RateLimitAggregation =
  | 'per_user'
  | 'per_api_key'
  | 'per_organization'
  | 'per_ip'
  | 'per_endpoint'
  | 'global';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  retryAfterSeconds?: number;
  appliedRule?: string;
}

// ============================================
// Data Governance Types
// ============================================

/**
 * Data governance policy configuration
 */
export interface DataGovernancePolicyConfig {
  /** PII handling rules */
  piiRules?: PiiHandlingRule[];

  /** Data retention rules */
  retentionRules?: DataRetentionRule[];

  /** Data classification rules */
  classificationRules?: DataClassificationRule[];

  /** Cross-border data transfer rules */
  transferRules?: DataTransferRule[];
}

/**
 * PII handling rule
 */
export interface PiiHandlingRule {
  /** PII type to match */
  piiType: string;

  /** Action to take */
  action: 'allow' | 'mask' | 'deny' | 'encrypt';

  /** Masking configuration (if action is mask) */
  maskConfig?: {
    pattern: string;
    replacement: string;
  };
}

/**
 * Data retention rule
 */
export interface DataRetentionRule {
  /** Data type this rule applies to */
  dataType: string;

  /** Retention period in days */
  retentionDays: number;

  /** Action when retention expires */
  expiryAction: 'delete' | 'archive' | 'anonymize';

  /** Exceptions to the rule */
  exceptions?: {
    tags?: string[];
    conditions?: string;
  };
}

/**
 * Data classification rule
 */
export interface DataClassificationRule {
  /** Classification level */
  level: 'public' | 'internal' | 'confidential' | 'restricted';

  /** Conditions for this classification */
  conditions: string;

  /** Required handling for this level */
  handling: {
    encryption?: boolean;
    auditRequired?: boolean;
    accessRestrictions?: string[];
  };
}

/**
 * Cross-border data transfer rule
 */
export interface DataTransferRule {
  /** Source region */
  sourceRegion: string;

  /** Destination region */
  destinationRegion: string;

  /** Whether transfer is allowed */
  allowed: boolean;

  /** Conditions for allowed transfer */
  conditions?: string;
}

// ============================================
// Access Control Types
// ============================================

/**
 * Access control policy configuration
 */
export interface AccessControlPolicyConfig {
  /** Role-based rules */
  rbacRules?: RbacRule[];

  /** Attribute-based rules */
  abacRules?: AbacRule[];

  /** Resource-based rules */
  resourceRules?: ResourceRule[];
}

/**
 * Role-based access control rule
 */
export interface RbacRule {
  /** Role this rule applies to */
  role: string;

  /** Resources this role can access */
  resources: OpaResourceType[];

  /** Operations allowed on those resources */
  operations: OpaOperation[];

  /** Additional conditions */
  conditions?: string;
}

/**
 * Attribute-based access control rule
 */
export interface AbacRule {
  /** Rule name */
  name: string;

  /** Subject attributes to match */
  subjectAttributes: Record<string, unknown>;

  /** Resource attributes to match */
  resourceAttributes?: Record<string, unknown>;

  /** Environment attributes to match */
  environmentAttributes?: Record<string, unknown>;

  /** Operations allowed when matched */
  operations: OpaOperation[];
}

/**
 * Resource-based access control rule
 */
export interface ResourceRule {
  /** Resource type */
  resourceType: OpaResourceType;

  /** Owner-based access rules */
  ownerAccess?: {
    operations: OpaOperation[];
  };

  /** Team-based access rules */
  teamAccess?: {
    operations: OpaOperation[];
    requireMembership: boolean;
  };

  /** Organization-wide access rules */
  orgAccess?: {
    operations: OpaOperation[];
    roles?: string[];
  };
}

// ============================================
// Policy CRUD Types
// ============================================

/**
 * Create policy parameters
 */
export interface CreateRegoPolicyParams {
  organizationId: string;
  name: string;
  description?: string;
  category: RegoPolicyCategory;
  regoCode: string;
  priority?: number;
  scope?: RegoPolicyScope;
  createdBy: string;
}

/**
 * Update policy parameters
 */
export interface UpdateRegoPolicyParams {
  id: string;
  name?: string;
  description?: string;
  regoCode?: string;
  priority?: number;
  scope?: RegoPolicyScope;
  isActive?: boolean;
}

/**
 * List policies parameters
 */
export interface ListRegoPoliciesParams {
  organizationId: string;
  category?: RegoPolicyCategory;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Policy validation result
 */
export interface PolicyValidationResult {
  valid: boolean;
  errors: PolicyValidationError[];
  warnings: PolicyValidationWarning[];
}

/**
 * Policy validation error
 */
export interface PolicyValidationError {
  line?: number;
  column?: number;
  message: string;
  code: string;
}

/**
 * Policy validation warning
 */
export interface PolicyValidationWarning {
  line?: number;
  column?: number;
  message: string;
  code: string;
}
