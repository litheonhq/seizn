/**
 * Policy Router
 *
 * Evaluates OPA policies before routing gateway requests.
 * Enforces cost budgets, rate limits, and content policies.
 *
 * Design principles:
 * - Configurable failure mode: fail-open by default, with fail-closed support for sensitive requests
 * - Non-blocking: Policy evaluation should not add significant latency
 * - Composable: Budget, content, and cost-optimization policies are independently toggleable
 */

import type { GatewayRequest, LLMProvider } from './types';
import { getOpaPolicyService } from '@/lib/winter/opa';
import type { OpaPrincipal, OpaDecision } from '@/lib/winter/opa';
import { getBudgetStatus } from '@/lib/control-tower/cost-attribution';
import type { BudgetStatus } from '@/lib/control-tower/cost-attribution';

// ============================================
// Types
// ============================================

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  modifications?: {
    maxTokens?: number;       // Cap tokens to stay within budget
    preferredProvider?: string; // Force cost-optimized provider
    requireLogging?: boolean;  // Force trace logging
  };
  budgetRemaining?: number;
  policyId?: string;
}

export interface PolicyRouterConfig {
  enableBudgetEnforcement: boolean;
  enableContentPolicy: boolean;
  enableCostOptimization: boolean;
  defaultBudgetCents: number;
  failureMode: 'open' | 'closed';
  failClosedOnToolCalls: boolean;
}

// Cost-optimized provider ordering (cheapest first)
const COST_OPTIMIZED_PROVIDERS: LLMProvider[] = [
  'google',
  'openai',
  'anthropic',
  'azure',
  'bedrock',
];

// Approximate cost tiers for models (per 1K tokens in USD)
const MODEL_COST_TIERS: Record<string, 'low' | 'medium' | 'high'> = {
  'gpt-4o-mini': 'low',
  'gpt-3.5-turbo': 'low',
  'gemini-1.5-flash': 'low',
  'claude-3-5-haiku-20241022': 'low',
  'o1-mini': 'medium',
  'gpt-4o': 'medium',
  'gemini-1.5-pro': 'medium',
  'claude-3-5-sonnet-20241022': 'medium',
  'gpt-4-turbo': 'high',
  'o1': 'high',
  'claude-3-opus-20240229': 'high',
};

const configuredFailureMode = process.env.POLICY_ROUTER_FAILURE_MODE;
const defaultFailureMode: 'open' | 'closed' =
  configuredFailureMode === 'open' || configuredFailureMode === 'closed'
    ? configuredFailureMode
    : process.env.NODE_ENV === 'production'
      ? 'closed'
      : 'open';

const DEFAULT_CONFIG: PolicyRouterConfig = {
  enableBudgetEnforcement: true,
  enableContentPolicy: true,
  enableCostOptimization: true,
  defaultBudgetCents: 10000, // $100/month default
  failureMode: defaultFailureMode,
  failClosedOnToolCalls: true,
};

// ============================================
// Policy Router
// ============================================

export class PolicyRouter {
  private config: PolicyRouterConfig;

  constructor(config: Partial<PolicyRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate all applicable policies for a gateway request.
   *
   * Checks in order:
   * 1. OPA access/content policies
   * 2. Budget enforcement
   * 3. Cost optimization modifications
   *
   * Uses configured fallback behavior when the policy engine is unavailable.
   */
  async evaluateRequest(
    request: GatewayRequest,
    userId: string,
    orgId?: string
  ): Promise<PolicyDecision> {
    const startTime = Date.now();

    try {
      // 1. Evaluate OPA content/access policies
      if (this.config.enableContentPolicy && orgId) {
        const opaDecision = await this.evaluateOpaPolicy(request, userId, orgId);
        if (!opaDecision.allowed) {
          return opaDecision;
        }
      }

      // 2. Enforce budget limits
      if (this.config.enableBudgetEnforcement && orgId) {
        const budgetDecision = await this.enforceBudget(userId, orgId, request);
        if (!budgetDecision.allowed) {
          return budgetDecision;
        }

        // 3. Apply cost optimizations if nearing budget
        if (this.config.enableCostOptimization && budgetDecision.budgetRemaining !== undefined) {
          const modifications = this.computeCostOptimizations(
            request,
            budgetDecision.budgetRemaining
          );
          if (modifications) {
            return {
              allowed: true,
              modifications,
              budgetRemaining: budgetDecision.budgetRemaining,
            };
          }

          return budgetDecision;
        }
      }

      // All checks passed, no modifications needed
      return { allowed: true };
    } catch (error) {
      // Fail open/closed based on configured failure mode.
      console.warn('[PolicyRouter] Policy evaluation failed, applying fallback mode:', {
        requestId: request.id,
        userId,
        orgId,
        error: error instanceof Error ? error.message : String(error),
        evaluationTimeMs: Date.now() - startTime,
      });
      return this.handlePolicyFailure('Policy evaluation', request);
    }
  }

  /**
   * Check monthly budget for a user/org.
   *
   * Returns not-allowed if the organization is over its monthly budget.
   * Returns allowed with budgetRemaining so the caller can apply cost optimizations.
   */
  async enforceBudget(
    userId: string,
    orgId: string,
    request?: GatewayRequest
  ): Promise<PolicyDecision> {
    try {
      const budgetStatus: BudgetStatus = await getBudgetStatus(orgId);

      // Hard block if over budget
      if (budgetStatus.isOverBudget) {
        return {
          allowed: false,
          reason: `Monthly budget exceeded. Current spend: $${(budgetStatus.currentSpend / 100).toFixed(2)}, ` +
            `limit: $${((budgetStatus.budgetLimit ?? 0) / 100).toFixed(2)}. ` +
            `Contact your organization admin to increase the budget.`,
          budgetRemaining: 0,
          policyId: 'budget_enforcement',
        };
      }

      // Calculate remaining budget in cents
      const budgetLimit = budgetStatus.budgetLimit ?? this.config.defaultBudgetCents;
      const remaining = budgetLimit - budgetStatus.currentSpend;

      return {
        allowed: true,
        budgetRemaining: Math.max(0, remaining),
      };
    } catch (error) {
      // Fail open/closed based on configured failure mode.
      console.warn('[PolicyRouter] Budget check failed, applying fallback mode:', {
        userId,
        orgId,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.handlePolicyFailure('Budget check', request);
    }
  }

  /**
   * Apply policy-driven modifications to a gateway request.
   *
   * Returns a new GatewayRequest with modifications applied.
   * The original request is not mutated.
   */
  applyModifications(
    request: GatewayRequest,
    decision: PolicyDecision
  ): GatewayRequest {
    if (!decision.modifications) {
      return request;
    }

    const modified = { ...request };
    const mods = decision.modifications;

    // Cap max tokens
    if (mods.maxTokens !== undefined) {
      modified.maxTokens = modified.maxTokens
        ? Math.min(modified.maxTokens, mods.maxTokens)
        : mods.maxTokens;
    }

    // Override preferred provider
    if (mods.preferredProvider) {
      modified.preferredProvider = mods.preferredProvider as LLMProvider;
    }

    // Force logging via metadata
    if (mods.requireLogging) {
      modified.metadata = {
        ...modified.metadata,
        policyRequireLogging: true,
        policyFailOpen: true,
      };
    }

    return modified;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Evaluate OPA policies for content and access control.
   */
  private async evaluateOpaPolicy(
    request: GatewayRequest,
    userId: string,
    orgId: string
  ): Promise<PolicyDecision> {
    try {
      const service = getOpaPolicyService();

      // Build OPA principal
      const principal: OpaPrincipal = {
        type: 'user',
        id: userId,
        organizationId: orgId,
      };

      // Evaluate access control for gateway usage
      const decision: OpaDecision = await service.checkAccess(
        principal,
        {
          type: 'settings', // Gateway is an org-level resource
          organizationId: orgId,
          attributes: {
            model: request.model,
            endpoint: '/api/gateway/chat',
            messageCount: request.messages?.length ?? 0,
          },
        },
        'create' // Creating a chat completion
      );

      if (!decision.allow) {
        return {
          allowed: false,
          reason: decision.reason || 'Request blocked by organization policy',
          policyId: decision.metadata?.policyId,
        };
      }

      // Also check rate limiting through OPA
      const rateLimitResult = await service.checkRateLimit(
        principal,
        '/api/gateway/chat'
      );

      if (!rateLimitResult.allowed) {
        return {
          allowed: false,
          reason: `OPA rate limit exceeded. Retry after ${rateLimitResult.retryAfterSeconds ?? 60} seconds.`,
          policyId: 'opa_rate_limit',
        };
      }

      return { allowed: true };
    } catch (error) {
      // Fail open/closed based on configured failure mode.
      console.warn('[PolicyRouter] OPA policy evaluation failed, applying fallback mode:', {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.handlePolicyFailure('OPA engine', request);
    }
  }

  private shouldFailClosed(request?: GatewayRequest): boolean {
    if (this.config.failureMode === 'closed') {
      return true;
    }

    if (!request) {
      return false;
    }

    if (this.config.failClosedOnToolCalls && Array.isArray(request.tools) && request.tools.length > 0) {
      return true;
    }

    return request.metadata?.policyFailClosed === true;
  }

  private handlePolicyFailure(component: string, request?: GatewayRequest): PolicyDecision {
    if (this.shouldFailClosed(request)) {
      return {
        allowed: false,
        reason: `${component} unavailable; request denied by fail-closed policy`,
        policyId: 'policy_engine_unavailable',
      };
    }

    return {
      allowed: true,
      reason: `${component} unavailable; request allowed by fail-open policy`,
      modifications: {
        requireLogging: true,
      },
      policyId: 'policy_engine_unavailable',
    };
  }

  /**
   * Compute cost optimization modifications based on remaining budget.
   *
   * When budget is getting tight:
   * - >50% remaining: no modifications
   * - 20-50% remaining: cap tokens, prefer cheaper provider
   * - <20% remaining: aggressive caps, force cheapest provider
   */
  private computeCostOptimizations(
    request: GatewayRequest,
    budgetRemainingCents: number
  ): PolicyDecision['modifications'] | null {
    // If no budget pressure, skip optimizations
    if (budgetRemainingCents > this.config.defaultBudgetCents * 0.5) {
      return null;
    }

    const modifications: PolicyDecision['modifications'] = {};
    const budgetPercent = budgetRemainingCents / this.config.defaultBudgetCents;
    const modelTier = MODEL_COST_TIERS[request.model] || 'medium';

    if (budgetPercent <= 0.2) {
      // Aggressive cost reduction
      modifications.maxTokens = 1024;
      modifications.requireLogging = true;

      // Force cheaper provider if using a high-cost model
      if (modelTier === 'high') {
        modifications.preferredProvider = 'google'; // Cheapest option
      }
    } else if (budgetPercent <= 0.5) {
      // Moderate cost reduction
      modifications.maxTokens = 2048;

      // Suggest cheaper provider for high-cost models
      if (modelTier === 'high') {
        modifications.preferredProvider = this.findCheaperProvider(request);
      }
    }

    // Only return modifications if we actually set something meaningful
    const hasModifications = modifications.maxTokens !== undefined ||
      modifications.preferredProvider !== undefined;

    return hasModifications ? modifications : null;
  }

  /**
   * Find a cheaper alternative provider for the requested model.
   */
  private findCheaperProvider(request: GatewayRequest): string | undefined {
    // If the request already specifies a preferred provider, respect it
    if (request.preferredProvider) {
      return undefined;
    }

    // Return the first cost-optimized provider that isn't the model's default
    for (const provider of COST_OPTIMIZED_PROVIDERS) {
      if (provider !== request.preferredProvider) {
        return provider;
      }
    }

    return undefined;
  }
}

// ============================================
// Singleton Instance
// ============================================

let routerInstance: PolicyRouter | null = null;

export function getPolicyRouter(config?: Partial<PolicyRouterConfig>): PolicyRouter {
  if (!routerInstance) {
    routerInstance = new PolicyRouter(config);
  }
  return routerInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetPolicyRouter(): void {
  routerInstance = null;
}
