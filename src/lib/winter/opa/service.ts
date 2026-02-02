/**
 * Seizn Winter - OPA Policy Service
 *
 * High-level service for policy evaluation that:
 * - Manages policy lifecycle
 * - Provides convenient evaluation methods
 * - Handles caching and performance optimization
 * - Integrates with audit logging
 */

import type {
  OpaDecision,
  OpaInput,
  OpaPrincipal,
  OpaResource,
  OpaAction,
  OpaContext,
  OpaResourceType,
  OpaOperation,
  RegoPolicyCategory,
  PolicyEvaluationRequest,
  PolicyEvaluationResponse,
  RateLimitResult,
  RateLimitSpec,
} from './types';
import { OpaPolicyEngine, OpaRateLimiter, getOpaPolicyEngine, getOpaRateLimiter } from './engine';
import { loadOrganizationPolicies, listRegoPolicies } from './storage';
import { getRateLimitForPlan } from './templates';
import { logAuditEvent } from '../org/audit-log';

// ============================================
// Service Configuration
// ============================================

interface OpaServiceConfig {
  /** Enable caching of policy decisions */
  enableCache?: boolean;

  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;

  /** Enable audit logging of policy decisions */
  enableAuditLog?: boolean;

  /** Log all decisions (not just denials) */
  logAllDecisions?: boolean;
}

const DEFAULT_CONFIG: OpaServiceConfig = {
  enableCache: true,
  cacheTtlMs: 5000,
  enableAuditLog: true,
  logAllDecisions: false,
};

// ============================================
// OPA Policy Service
// ============================================

export class OpaPolicyService {
  private engine: OpaPolicyEngine;
  private rateLimiter: OpaRateLimiter;
  private config: OpaServiceConfig;
  private loadedOrganizations: Set<string> = new Set();

  constructor(config?: Partial<OpaServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.engine = getOpaPolicyEngine();
    this.rateLimiter = getOpaRateLimiter();
  }

  // ============================================
  // Policy Evaluation
  // ============================================

  /**
   * Evaluate access control policies
   */
  async checkAccess(
    principal: OpaPrincipal,
    resource: OpaResource,
    operation: OpaOperation,
    context?: Partial<OpaContext>
  ): Promise<OpaDecision> {
    // Ensure policies are loaded
    if (principal.organizationId) {
      await this.ensureOrganizationPoliciesLoaded(principal.organizationId);
    }

    const input: OpaInput = {
      principal,
      resource,
      action: { operation },
      context: this.buildContext(context),
    };

    const response = await this.evaluate({
      input,
      categories: ['access_control'],
    });

    // Audit log if denied or if logging all
    if (this.config.enableAuditLog && (!response.decision.allow || this.config.logAllDecisions)) {
      await this.logPolicyDecision(input, response.decision, 'access_control');
    }

    return response.decision;
  }

  /**
   * Evaluate data governance policies
   */
  async checkDataGovernance(
    principal: OpaPrincipal,
    resource: OpaResource,
    operation: OpaOperation,
    data?: Record<string, unknown>
  ): Promise<OpaDecision> {
    if (principal.organizationId) {
      await this.ensureOrganizationPoliciesLoaded(principal.organizationId);
    }

    const input: OpaInput = {
      principal,
      resource,
      action: { operation },
      context: this.buildContext(),
      data,
    };

    const response = await this.evaluate({
      input,
      categories: ['data_governance'],
    });

    if (this.config.enableAuditLog && (!response.decision.allow || this.config.logAllDecisions)) {
      await this.logPolicyDecision(input, response.decision, 'data_governance');
    }

    return response.decision;
  }

  /**
   * Check rate limits
   */
  async checkRateLimit(
    principal: OpaPrincipal,
    endpoint?: string,
    customSpec?: RateLimitSpec
  ): Promise<RateLimitResult> {
    // Determine the rate limit key
    const key = this.getRateLimitKey(principal, endpoint);

    // Get the appropriate rate limit spec
    const spec = customSpec || this.getRateLimitSpec(principal);

    // Check the limit
    const result = this.rateLimiter.checkRateLimit(key, spec);

    // Log if rate limited
    if (!result.allowed && this.config.enableAuditLog) {
      await logAuditEvent({
        user_id: principal.type === 'user' ? principal.id : undefined,
        organization_id: principal.organizationId,
        action: 'security.rate_limited',
        resource_type: 'settings',
        details: {
          endpoint,
          remaining: result.remaining,
          resetAt: result.resetAt,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        status: 'denied',
      });
    }

    return result;
  }

  /**
   * Full policy evaluation with all categories
   */
  async evaluate(request: PolicyEvaluationRequest): Promise<PolicyEvaluationResponse> {
    return this.engine.evaluate(request);
  }

  /**
   * Evaluate a specific policy by ID
   */
  async evaluatePolicy(
    policyId: string,
    input: OpaInput
  ): Promise<PolicyEvaluationResponse> {
    return this.engine.evaluate({
      input,
      policyIds: [policyId],
      includeAllDecisions: true,
    });
  }

  // ============================================
  // Policy Management
  // ============================================

  /**
   * Load policies for an organization
   */
  async loadPolicies(organizationId: string, force?: boolean): Promise<number> {
    if (!force && this.loadedOrganizations.has(organizationId)) {
      return 0;
    }

    const count = await loadOrganizationPolicies(organizationId);
    this.loadedOrganizations.add(organizationId);

    return count;
  }

  /**
   * Reload all policies for an organization
   */
  async reloadPolicies(organizationId: string): Promise<number> {
    this.loadedOrganizations.delete(organizationId);
    return this.loadPolicies(organizationId, true);
  }

  /**
   * Clear cached decisions
   */
  clearCache(): void {
    this.engine.clearPolicies();
    this.loadedOrganizations.clear();
  }

  /**
   * Get loaded policy count
   */
  async getPolicyCount(organizationId: string): Promise<number> {
    const result = await listRegoPolicies({
      organizationId,
      isActive: true,
      limit: 1,
    });
    return result.total;
  }

  // ============================================
  // Convenience Methods
  // ============================================

  /**
   * Check if a user can read a resource
   */
  async canRead(
    userId: string,
    organizationId: string,
    resourceType: OpaResourceType,
    resourceId?: string,
    resourceOwnerId?: string
  ): Promise<boolean> {
    const decision = await this.checkAccess(
      {
        type: 'user',
        id: userId,
        organizationId,
      },
      {
        type: resourceType,
        id: resourceId,
        organizationId,
        ownerId: resourceOwnerId,
      },
      'read'
    );

    return decision.allow;
  }

  /**
   * Check if a user can write a resource
   */
  async canWrite(
    userId: string,
    organizationId: string,
    resourceType: OpaResourceType,
    resourceId?: string,
    resourceOwnerId?: string
  ): Promise<boolean> {
    const decision = await this.checkAccess(
      {
        type: 'user',
        id: userId,
        organizationId,
      },
      {
        type: resourceType,
        id: resourceId,
        organizationId,
        ownerId: resourceOwnerId,
      },
      'update'
    );

    return decision.allow;
  }

  /**
   * Check if a user can delete a resource
   */
  async canDelete(
    userId: string,
    organizationId: string,
    resourceType: OpaResourceType,
    resourceId?: string,
    resourceOwnerId?: string
  ): Promise<boolean> {
    const decision = await this.checkAccess(
      {
        type: 'user',
        id: userId,
        organizationId,
      },
      {
        type: resourceType,
        id: resourceId,
        organizationId,
        ownerId: resourceOwnerId,
      },
      'delete'
    );

    return decision.allow;
  }

  /**
   * Check if a user can admin a resource
   */
  async canAdmin(
    userId: string,
    organizationId: string,
    resourceType: OpaResourceType
  ): Promise<boolean> {
    const decision = await this.checkAccess(
      {
        type: 'user',
        id: userId,
        organizationId,
      },
      {
        type: resourceType,
        organizationId,
      },
      'admin'
    );

    return decision.allow;
  }

  /**
   * Check if an API key can perform an operation
   */
  async canApiKeyAccess(
    apiKeyId: string,
    organizationId: string,
    operation: OpaOperation,
    resourceType: OpaResourceType,
    resourceId?: string,
    scopes?: string[]
  ): Promise<boolean> {
    const decision = await this.checkAccess(
      {
        type: 'api_key',
        id: apiKeyId,
        organizationId,
        attributes: { scopes },
      },
      {
        type: resourceType,
        id: resourceId,
        organizationId,
      },
      operation
    );

    return decision.allow;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async ensureOrganizationPoliciesLoaded(organizationId: string): Promise<void> {
    if (!this.loadedOrganizations.has(organizationId)) {
      await this.loadPolicies(organizationId);
    }
  }

  private buildContext(partial?: Partial<OpaContext>): OpaContext {
    const now = new Date();

    return {
      timestamp: now.toISOString(),
      time: {
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
        isWeekend: now.getDay() === 0 || now.getDay() === 6,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      ...partial,
    };
  }

  private getRateLimitKey(principal: OpaPrincipal, endpoint?: string): string {
    const parts = [principal.type, principal.id];

    if (endpoint) {
      parts.push(endpoint);
    }

    return parts.join(':');
  }

  private getRateLimitSpec(principal: OpaPrincipal): RateLimitSpec {
    // Get plan from principal attributes
    const plan = (principal.attributes?.plan as string) || 'free';
    return getRateLimitForPlan(plan);
  }

  private async logPolicyDecision(
    input: OpaInput,
    decision: OpaDecision,
    category: RegoPolicyCategory
  ): Promise<void> {
    try {
      // Use 'pii.denied' for denied decisions (closest match for policy denials)
      // and skip logging for allowed decisions unless specifically configured
      if (!decision.allow) {
        await logAuditEvent({
          user_id: input.principal.type === 'user' ? input.principal.id : undefined,
          api_key_id: input.principal.type === 'api_key' ? input.principal.id : undefined,
          organization_id: input.principal.organizationId,
          action: 'pii.denied', // Using existing action type for policy denials
          resource_type: 'policies',
          resource_id: input.resource?.id,
          details: {
            policyCategory: category,
            operation: input.action.operation,
            reason: decision.reason,
            policyId: decision.metadata?.policyId,
            resourceType: input.resource?.type,
          },
          status: 'denied',
        });
      }
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('[OPA Service] Failed to log policy decision:', error);
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let serviceInstance: OpaPolicyService | null = null;

export function getOpaPolicyService(config?: Partial<OpaServiceConfig>): OpaPolicyService {
  if (!serviceInstance) {
    serviceInstance = new OpaPolicyService(config);
  }
  return serviceInstance;
}

// ============================================
// Middleware Helper
// ============================================

/**
 * Create a middleware-compatible check function
 */
export function createPolicyCheck(
  category: RegoPolicyCategory | 'rate_limit'
): (
  principal: OpaPrincipal,
  resource?: OpaResource,
  operation?: OpaOperation
) => Promise<{ allowed: boolean; reason?: string }> {
  const service = getOpaPolicyService();

  return async (principal, resource, operation = 'read') => {
    if (category === 'rate_limit') {
      const result = await service.checkRateLimit(principal);
      return {
        allowed: result.allowed,
        reason: result.allowed
          ? undefined
          : `Rate limit exceeded. Retry after ${result.retryAfterSeconds} seconds.`,
      };
    }

    if (!resource) {
      return { allowed: true };
    }

    let decision: OpaDecision;

    if (category === 'access_control') {
      decision = await service.checkAccess(principal, resource, operation);
    } else if (category === 'data_governance') {
      decision = await service.checkDataGovernance(principal, resource, operation);
    } else {
      const response = await service.evaluate({
        input: {
          principal,
          resource,
          action: { operation },
        },
        categories: [category],
      });
      decision = response.decision;
    }

    return {
      allowed: decision.allow,
      reason: decision.reason,
    };
  };
}
