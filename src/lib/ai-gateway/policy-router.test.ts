/**
 * PolicyRouter Unit Tests
 *
 * Tests OPA policy evaluation, budget enforcement, cost optimization,
 * and modification application.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PolicyRouter,
  getPolicyRouter,
  resetPolicyRouter,
  type PolicyDecision,
} from './policy-router';
import type { GatewayRequest } from './types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/winter/opa', () => ({
  getOpaPolicyService: vi.fn().mockReturnValue({
    checkAccess: vi.fn().mockResolvedValue({ allow: true }),
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  }),
}));

vi.mock('@/lib/control-tower/cost-attribution', () => ({
  getBudgetStatus: vi.fn().mockResolvedValue({
    isOverBudget: false,
    currentSpend: 3000,
    budgetLimit: 10000,
  }),
}));

import { getOpaPolicyService } from '@/lib/winter/opa';
import { getBudgetStatus } from '@/lib/control-tower/cost-attribution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    id: 'req-001',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'hello' }],
    maxTokens: 4096,
    ...overrides,
  };
}

function asMock<T extends (...args: unknown[]) => unknown>(fn: T) {
  return fn as unknown as ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolicyRouter', () => {
  let router: PolicyRouter;

  beforeEach(() => {
    resetPolicyRouter();
    router = new PolicyRouter({
      enableBudgetEnforcement: true,
      enableContentPolicy: true,
      enableCostOptimization: true,
      defaultBudgetCents: 10000,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPolicyRouter();
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const r = new PolicyRouter();
      expect(r).toBeDefined();
    });

    it('merges provided config with defaults', () => {
      const r = new PolicyRouter({ enableCostOptimization: false });
      expect(r).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // evaluateRequest
  // -------------------------------------------------------------------------

  describe('evaluateRequest', () => {
    it('allows request when all checks pass', async () => {
      const result = await router.evaluateRequest(makeRequest(), 'user-1', 'org-1');
      expect(result.allowed).toBe(true);
    });

    it('blocks when OPA access check denies', async () => {
      const mockOpa = getOpaPolicyService();
      asMock(mockOpa.checkAccess).mockResolvedValueOnce({
        allow: false,
        reason: 'Blocked by policy',
      });

      const result = await router.evaluateRequest(makeRequest(), 'user-1', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Blocked by');
    });

    it('blocks when OPA rate limit denies', async () => {
      const mockOpa = getOpaPolicyService();
      asMock(mockOpa.checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        retryAfterSeconds: 30,
      });

      const result = await router.evaluateRequest(makeRequest(), 'user-1', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('rate limit');
    });

    it('blocks when over budget', async () => {
      asMock(getBudgetStatus).mockResolvedValueOnce({
        isOverBudget: true,
        currentSpend: 12000,
        budgetLimit: 10000,
      });

      const result = await router.evaluateRequest(makeRequest(), 'user-1', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('budget exceeded');
    });

    it('fails open when OPA throws error', async () => {
      // Disable budget enforcement so the OPA fail-open result is returned directly
      router = new PolicyRouter({
        enableContentPolicy: true,
        enableBudgetEnforcement: false,
        enableCostOptimization: false,
      });
      const mockOpa = getOpaPolicyService();
      asMock(mockOpa.checkAccess).mockRejectedValueOnce(new Error('OPA down'));

      const result = await router.evaluateRequest(makeRequest(), 'user-1', 'org-1');
      // evaluateOpaPolicy catches internally and returns allowed with requireLogging
      expect(result.allowed).toBe(true);
    });

    it('fails closed for tool requests when OPA throws', async () => {
      router = new PolicyRouter({
        enableContentPolicy: true,
        enableBudgetEnforcement: false,
        enableCostOptimization: false,
        failClosedOnToolCalls: true,
      });
      const mockOpa = getOpaPolicyService();
      asMock(mockOpa.checkAccess).mockRejectedValueOnce(new Error('OPA down'));

      const result = await router.evaluateRequest(
        makeRequest({
          tools: [{ type: 'function', function: { name: 'send_email' } }],
        }),
        'user-1',
        'org-1'
      );

      expect(result.allowed).toBe(false);
      expect(result.policyId).toBe('policy_engine_unavailable');
    });

    it('fails closed globally when failureMode is closed', async () => {
      router = new PolicyRouter({
        enableContentPolicy: true,
        enableBudgetEnforcement: false,
        enableCostOptimization: false,
        failureMode: 'closed',
      });
      const mockOpa = getOpaPolicyService();
      asMock(mockOpa.checkAccess).mockRejectedValueOnce(new Error('OPA down'));

      const result = await router.evaluateRequest(makeRequest(), 'user-1', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.policyId).toBe('policy_engine_unavailable');
    });

    it('skips OPA when orgId is not provided', async () => {
      const result = await router.evaluateRequest(makeRequest(), 'user-1');
      expect(result.allowed).toBe(true);
      expect(getOpaPolicyService().checkAccess).not.toHaveBeenCalled();
    });

    it('skips content policy when disabled', async () => {
      router = new PolicyRouter({ enableContentPolicy: false });
      const result = await router.evaluateRequest(makeRequest(), 'user-1', 'org-1');
      expect(result.allowed).toBe(true);
      expect(getOpaPolicyService().checkAccess).not.toHaveBeenCalled();
    });

    it('applies cost optimizations when budget is tight', async () => {
      // Budget at 15% remaining (1500 of 10000)
      asMock(getBudgetStatus).mockResolvedValueOnce({
        isOverBudget: false,
        currentSpend: 8500,
        budgetLimit: 10000,
      });

      const result = await router.evaluateRequest(
        makeRequest({ model: 'claude-3-opus-20240229' }),
        'user-1',
        'org-1'
      );

      expect(result.allowed).toBe(true);
      expect(result.modifications).toBeDefined();
      expect(result.modifications?.maxTokens).toBeDefined();
    });

    it('uses org budget limit (not default budget) when calculating optimization threshold', async () => {
      // 10,000 remaining out of 40,000 => 25% remaining (should optimize).
      asMock(getBudgetStatus).mockResolvedValueOnce({
        isOverBudget: false,
        currentSpend: 30000,
        budgetLimit: 40000,
      });

      const result = await router.evaluateRequest(makeRequest(), 'user-1', 'org-1');
      expect(result.allowed).toBe(true);
      expect(result.modifications?.maxTokens).toBe(2048);
    });

    it('does not force incompatible provider for high-tier models', async () => {
      asMock(getBudgetStatus).mockResolvedValueOnce({
        isOverBudget: false,
        currentSpend: 9000,
        budgetLimit: 10000,
      });

      const result = await router.evaluateRequest(
        makeRequest({ model: 'claude-3-opus-20240229' }),
        'user-1',
        'org-1'
      );

      expect(result.allowed).toBe(true);
      expect(result.modifications?.preferredProvider).toBe('anthropic');
    });
  });

  // -------------------------------------------------------------------------
  // enforceBudget
  // -------------------------------------------------------------------------

  describe('enforceBudget', () => {
    it('blocks when over budget', async () => {
      asMock(getBudgetStatus).mockResolvedValueOnce({
        isOverBudget: true,
        currentSpend: 15000,
        budgetLimit: 10000,
      });

      const result = await router.enforceBudget('user-1', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.budgetRemaining).toBe(0);
      expect(result.policyId).toBe('budget_enforcement');
    });

    it('returns budget remaining when under budget', async () => {
      asMock(getBudgetStatus).mockResolvedValueOnce({
        isOverBudget: false,
        currentSpend: 3000,
        budgetLimit: 10000,
      });

      const result = await router.enforceBudget('user-1', 'org-1');
      expect(result.allowed).toBe(true);
      expect(result.budgetRemaining).toBe(7000);
    });

    it('fails open when budget check throws', async () => {
      asMock(getBudgetStatus).mockRejectedValueOnce(new Error('Service down'));

      const result = await router.enforceBudget('user-1', 'org-1');
      expect(result.allowed).toBe(true);
    });

    it('fails closed when budget service throws and failureMode is closed', async () => {
      router = new PolicyRouter({ failureMode: 'closed' });
      asMock(getBudgetStatus).mockRejectedValueOnce(new Error('Service down'));

      const result = await router.enforceBudget('user-1', 'org-1', makeRequest());
      expect(result.allowed).toBe(false);
      expect(result.policyId).toBe('policy_engine_unavailable');
    });
  });

  // -------------------------------------------------------------------------
  // applyModifications
  // -------------------------------------------------------------------------

  describe('applyModifications', () => {
    it('returns original request when no modifications', () => {
      const req = makeRequest();
      const decision: PolicyDecision = { allowed: true };

      const result = router.applyModifications(req, decision);
      expect(result).toBe(req); // Same reference = no mutation
    });

    it('caps maxTokens', () => {
      const req = makeRequest({ maxTokens: 8192 });
      const decision: PolicyDecision = {
        allowed: true,
        modifications: { maxTokens: 1024 },
      };

      const result = router.applyModifications(req, decision);
      expect(result.maxTokens).toBe(1024);
    });

    it('does not increase maxTokens', () => {
      const req = makeRequest({ maxTokens: 512 });
      const decision: PolicyDecision = {
        allowed: true,
        modifications: { maxTokens: 1024 },
      };

      const result = router.applyModifications(req, decision);
      expect(result.maxTokens).toBe(512); // Min of 512, 1024
    });

    it('sets maxTokens when request has none', () => {
      const req = makeRequest();
      delete req.maxTokens;
      const decision: PolicyDecision = {
        allowed: true,
        modifications: { maxTokens: 2048 },
      };

      const result = router.applyModifications(req, decision);
      expect(result.maxTokens).toBe(2048);
    });

    it('overrides preferred provider', () => {
      const req = makeRequest();
      const decision: PolicyDecision = {
        allowed: true,
        modifications: { preferredProvider: 'google' },
      };

      const result = router.applyModifications(req, decision);
      expect(result.preferredProvider).toBe('google');
    });

    it('sets policyRequireLogging in metadata', () => {
      const req = makeRequest();
      const decision: PolicyDecision = {
        allowed: true,
        modifications: { requireLogging: true },
      };

      const result = router.applyModifications(req, decision);
      expect(result.metadata?.policyRequireLogging).toBe(true);
    });

    it('does not mutate original request', () => {
      const req = makeRequest({ maxTokens: 4096 });
      const decision: PolicyDecision = {
        allowed: true,
        modifications: { maxTokens: 1024 },
      };

      router.applyModifications(req, decision);
      expect(req.maxTokens).toBe(4096); // Original unchanged
    });
  });

  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------

  describe('getPolicyRouter / resetPolicyRouter', () => {
    it('returns singleton instance', () => {
      resetPolicyRouter();
      const a = getPolicyRouter();
      const b = getPolicyRouter();
      expect(a).toBe(b);
    });

    it('resets singleton', () => {
      const a = getPolicyRouter();
      resetPolicyRouter();
      const b = getPolicyRouter();
      expect(a).not.toBe(b);
    });
  });
});
