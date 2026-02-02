/**
 * Seizn Winter - OPA (Open Policy Agent) Integration
 *
 * Provides Rego-compatible policy evaluation for:
 * - Access control (RBAC, ABAC, resource-based)
 * - Data governance (PII handling, classification, retention)
 * - Rate limiting (per-user, per-endpoint, cost-based)
 *
 * @example
 * ```typescript
 * import { getOpaPolicyService } from '@/lib/winter/opa';
 *
 * const service = getOpaPolicyService();
 *
 * // Check if user can read a memory
 * const canRead = await service.canRead(
 *   userId,
 *   organizationId,
 *   'memory',
 *   memoryId,
 *   memoryOwnerId
 * );
 *
 * // Check rate limit
 * const rateLimit = await service.checkRateLimit(
 *   { type: 'user', id: userId, organizationId },
 *   '/api/memories'
 * );
 * ```
 */

// Core types
export type {
  // Decision types
  OpaDecision,
  OpaInput,
  OpaPrincipal,
  OpaResource,
  OpaAction,
  OpaContext,
  PolicyCondition,
  // Resource and operation types
  OpaResourceType,
  OpaOperation,
  // Policy types
  RegoPolicy,
  RegoPolicyCategory,
  RegoPolicyScope,
  // Rate limiting types
  RateLimitPolicyConfig,
  RateLimitRule,
  RateLimitSpec,
  RateLimitAggregation,
  RateLimitResult,
  // Data governance types
  DataGovernancePolicyConfig,
  PiiHandlingRule,
  DataRetentionRule,
  DataClassificationRule,
  DataTransferRule,
  // Access control types
  AccessControlPolicyConfig,
  RbacRule,
  AbacRule,
  ResourceRule,
  // Evaluation types
  PolicyEvaluationRequest,
  PolicyEvaluationResponse,
  // CRUD types
  CreateRegoPolicyParams,
  UpdateRegoPolicyParams,
  ListRegoPoliciesParams,
  PolicyValidationResult,
  PolicyValidationError,
  PolicyValidationWarning,
} from './types';

// Engine
export {
  OpaPolicyEngine,
  OpaRateLimiter,
  getOpaPolicyEngine,
  getOpaRateLimiter,
} from './engine';

// Service
export {
  OpaPolicyService,
  getOpaPolicyService,
  createPolicyCheck,
} from './service';

// Storage
export {
  createRegoPolicy,
  getRegoPolicy,
  listRegoPolicies,
  updateRegoPolicy,
  deleteRegoPolicy,
  activateRegoPolicy,
  deactivateRegoPolicy,
  loadOrganizationPolicies,
  reloadPolicy,
  getPolicyVersionHistory,
  rollbackPolicy,
  testPolicy,
  exportPolicies,
  importPolicies,
} from './storage';

// Templates
export type { PolicyTemplate, PolicyTemplateVariable } from './templates';
export {
  ACCESS_CONTROL_TEMPLATES,
  DATA_GOVERNANCE_TEMPLATES,
  RATE_LIMITING_TEMPLATES,
  AUDIT_TEMPLATES,
  ALL_POLICY_TEMPLATES,
  getTemplatesByCategory,
  getTemplateById,
  applyTemplateVariables,
  DEFAULT_RATE_LIMITS,
  getRateLimitForPlan,
} from './templates';
