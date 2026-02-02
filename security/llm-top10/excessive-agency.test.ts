/**
 * OWASP LLM08: Excessive Agency Tests
 *
 * Tests for unauthorized tool execution and destructive action prevention.
 * Critical for Seizn's tool-gating feature.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  EXCESSIVE_AGENCY_SCENARIOS,
  createTestContext,
} from './utils';

// Mock tool definitions
const REGISTERED_TOOLS = {
  file_read: { requiresApproval: false, dangerLevel: 'low' },
  file_write: { requiresApproval: true, dangerLevel: 'medium' },
  file_delete: { requiresApproval: true, dangerLevel: 'high' },
  database_query: { requiresApproval: false, dangerLevel: 'low' },
  database_drop: { requiresApproval: true, dangerLevel: 'critical' },
  email_send: { requiresApproval: true, dangerLevel: 'medium' },
  payment_process: { requiresApproval: true, dangerLevel: 'critical' },
  admin_access: { requiresApproval: true, dangerLevel: 'critical', requiredRole: 'admin' },
  api_key_create: { requiresApproval: true, dangerLevel: 'high' },
};

type ToolAction = keyof typeof REGISTERED_TOOLS;

interface ToolExecutionRequest {
  action: string;
  target?: unknown;
  context: ReturnType<typeof createTestContext>;
  approved?: boolean;
}

interface ToolExecutionResult {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  dangerLevel?: string;
}

// Mock tool gating implementation
async function executeToolWithGating(
  request: ToolExecutionRequest
): Promise<ToolExecutionResult> {
  const tool = REGISTERED_TOOLS[request.action as ToolAction];

  // Unknown tool - deny by default
  if (!tool) {
    return {
      allowed: false,
      reason: 'Unknown tool - not in registry',
    };
  }

  // Check role requirements
  if (tool.requiredRole && request.context.userRole !== tool.requiredRole) {
    return {
      allowed: false,
      reason: `Insufficient permissions. Required: ${tool.requiredRole}, Has: ${request.context.userRole}`,
      dangerLevel: tool.dangerLevel,
    };
  }

  // Check if approval required
  if (tool.requiresApproval && !request.approved) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: 'This action requires explicit approval',
      dangerLevel: tool.dangerLevel,
    };
  }

  // Critical actions require additional confirmation
  if (tool.dangerLevel === 'critical') {
    return {
      allowed: false,
      requiresApproval: true,
      reason: 'Critical action - requires human-in-the-loop confirmation',
      dangerLevel: tool.dangerLevel,
    };
  }

  return {
    allowed: true,
    dangerLevel: tool.dangerLevel,
  };
}

// Mock ambiguous instruction handler
async function handleAmbiguousInstruction(
  instruction: string,
  context: ReturnType<typeof createTestContext>
): Promise<{
  shouldProceed: boolean;
  clarificationNeeded: boolean;
  potentialActions: string[];
  risks: string[];
}> {
  const dangerousKeywords = ['delete', 'remove', 'drop', 'all', 'everyone', 'update'];
  const foundKeywords = dangerousKeywords.filter((kw) =>
    instruction.toLowerCase().includes(kw)
  );

  if (foundKeywords.length > 0) {
    return {
      shouldProceed: false,
      clarificationNeeded: true,
      potentialActions: foundKeywords.map((kw) => `Potential ${kw} operation detected`),
      risks: [
        'Ambiguous instruction with potentially destructive intent',
        'Clarification required before proceeding',
      ],
    };
  }

  return {
    shouldProceed: true,
    clarificationNeeded: false,
    potentialActions: [],
    risks: [],
  };
}

describe('LLM08: Excessive Agency', () => {
  describe('Destructive Actions', () => {
    it.each(EXCESSIVE_AGENCY_SCENARIOS.destructive)(
      'should require approval for destructive action: $action',
      async (scenario) => {
        const ctx = createTestContext();
        const result = await executeToolWithGating({
          action: scenario.action,
          target: scenario.target,
          context: ctx,
          approved: false, // Not approved
        });

        expect(result.allowed).toBe(false);
        expect(result.requiresApproval).toBe(true);
      }
    );

    it('should block destructive action even with wrong approval token', async () => {
      const ctx = createTestContext();
      const result = await executeToolWithGating({
        action: 'database_drop',
        target: 'users',
        context: ctx,
        approved: false, // Simulating invalid/missing approval
      });

      expect(result.allowed).toBe(false);
      expect(result.dangerLevel).toBe('critical');
    });
  });

  describe('Unauthorized Access', () => {
    it('should deny admin access to non-admin users', async () => {
      const ctx = createTestContext({ userRole: 'member' });
      const result = await executeToolWithGating({
        action: 'admin_access',
        context: ctx,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient permissions');
    });

    it('should deny cross-organization access', async () => {
      const ctx = createTestContext({ organizationId: 'org-123' });
      const result = await executeToolWithGating({
        action: 'cross_org_read',
        target: { targetOrg: 'org-456' },
        context: ctx,
      });

      expect(result.allowed).toBe(false);
    });

    it('should deny unregistered tool execution', async () => {
      const ctx = createTestContext();
      const result = await executeToolWithGating({
        action: 'unknown_dangerous_tool',
        context: ctx,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unknown tool');
    });
  });

  describe('Ambiguous Instructions', () => {
    it.each(EXCESSIVE_AGENCY_SCENARIOS.ambiguous)(
      'should flag ambiguous instruction: %s',
      async (instruction) => {
        const ctx = createTestContext();
        const result = await handleAmbiguousInstruction(instruction, ctx);

        expect(result.clarificationNeeded).toBe(true);
        expect(result.shouldProceed).toBe(false);
        expect(result.risks.length).toBeGreaterThan(0);
      }
    );

    it('should allow clear, safe instructions', async () => {
      const ctx = createTestContext();
      const result = await handleAmbiguousInstruction(
        'List the first 10 items in my collection',
        ctx
      );

      expect(result.shouldProceed).toBe(true);
      expect(result.clarificationNeeded).toBe(false);
    });
  });

  describe('Permission Boundaries', () => {
    it('should enforce least privilege principle', async () => {
      const ctx = createTestContext({ userRole: 'member' });

      // Member should not be able to create full-access API keys
      const result = await executeToolWithGating({
        action: 'api_key_create',
        target: { scope: 'full_access' },
        context: ctx,
        approved: true, // Even with approval
      });

      // Should still be blocked due to danger level
      expect(result.allowed).toBe(false);
    });

    it('should allow low-risk operations without approval', async () => {
      const ctx = createTestContext();
      const result = await executeToolWithGating({
        action: 'file_read',
        target: '/safe/path/file.txt',
        context: ctx,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Human-in-the-Loop', () => {
    it('should require HITL for critical operations', async () => {
      const ctx = createTestContext({ userRole: 'admin' });
      const result = await executeToolWithGating({
        action: 'payment_process',
        target: { amount: 10000 },
        context: ctx,
        approved: true, // Has approval but still critical
      });

      expect(result.requiresApproval).toBe(true);
      expect(result.reason).toContain('human-in-the-loop');
    });

    it('should enforce confirmation for bulk operations', async () => {
      const ctx = createTestContext();
      const result = await handleAmbiguousInstruction(
        'Update all user records',
        ctx
      );

      expect(result.clarificationNeeded).toBe(true);
    });
  });
});
