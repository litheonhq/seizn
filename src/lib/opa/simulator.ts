/**
 * Seizn Policy Simulator
 *
 * Test and debug policies before deployment
 */

import type {
  PolicyInput,
  PolicyDecision,
  K12PolicyDecision,
  PolicySimulationRequest,
  PolicySimulationResponse,
  PolicyExplanation,
  PolicyTestCase,
  PolicyTestResult,
  PolicyTestSuite,
  PolicyTestSuiteResult,
} from './types';
import { PolicyEvaluator, evaluatePolicy, evaluateK12Policy } from './evaluator';

// ============================================
// Policy Simulator Class
// ============================================

export class PolicySimulator {
  private evaluator: PolicyEvaluator;
  private traces: Map<string, unknown[]>;

  constructor() {
    this.evaluator = new PolicyEvaluator({ strict: false });
    this.traces = new Map();
  }

  /**
   * Simulate policy evaluation with detailed explanation
   */
  async simulate(request: PolicySimulationRequest): Promise<PolicySimulationResponse> {
    const startTime = performance.now();
    const { input, entrypoint, explain } = request;

    // Determine if K-12 action
    const isK12 = input.action.startsWith('k12.');

    let result: PolicyDecision | K12PolicyDecision;
    let explanation: PolicyExplanation | undefined;

    if (isK12) {
      const evalResult = await this.evaluator.evaluateK12(input, { entrypoint });
      result = evalResult.decision;
    } else {
      const evalResult = await this.evaluator.evaluate(input, { entrypoint });
      result = evalResult.decision;
    }

    // Generate explanation if requested
    if (explain) {
      explanation = this.generateExplanation(input, result);
    }

    const endTime = performance.now();

    return {
      result,
      explanation,
      evaluation_time_ms: endTime - startTime,
      bundle_version: this.evaluator.getCacheStatus().version || 'fallback',
    };
  }

  /**
   * Generate human-readable explanation of policy decision
   */
  private generateExplanation(
    input: PolicyInput,
    result: PolicyDecision | K12PolicyDecision
  ): PolicyExplanation {
    const rulesEvaluated: string[] = [];
    const rulesMatched: string[] = [];
    const denyReasonsDetail: Array<{
      reason: string;
      rule: string;
      inputs_used: Record<string, unknown>;
    }> = [];

    // Analyze main decision
    rulesEvaluated.push('allow');
    if ('allow' in result && result.allow) {
      rulesMatched.push('allow');
    }

    // Analyze deny reasons
    if ('deny_reasons' in result) {
      for (const reason of result.deny_reasons) {
        rulesEvaluated.push(`deny_rules.${reason}`);
        denyReasonsDetail.push(this.explainDenyReason(reason, input));
      }
    }

    // Analyze specific rules based on action
    const actionRules = this.getActionRules(input.action);
    rulesEvaluated.push(...actionRules);

    // Check which rules matched
    for (const rule of actionRules) {
      if (this.ruleMatched(rule, input, result)) {
        rulesMatched.push(rule);
      }
    }

    return {
      rules_evaluated: rulesEvaluated,
      rules_matched: rulesMatched,
      deny_reasons_detail: denyReasonsDetail,
    };
  }

  /**
   * Get rules relevant to specific action
   */
  private getActionRules(action: string): string[] {
    const commonRules = [
      'valid_user',
      'ip_blocked',
      'rate_limit_exceeded',
      'requires_2fa',
    ];

    const actionRuleMap: Record<string, string[]> = {
      'memory.write': [
        ...commonRules,
        'memory_write_allowed',
        'has_write_permission',
        'within_memory_limit',
        'content_allowed',
        'pii_denied',
      ],
      'memory.read': [
        ...commonRules,
        'memory_read_allowed',
        'has_read_permission',
        'namespace_accessible',
      ],
      'trace.share': [
        ...commonRules,
        'trace_share_allowed',
        'is_trace_owner',
        'share_target_valid',
      ],
      'mcp.tool.execute': [
        ...commonRules,
        'mcp_tool_allowed',
        'tool_enabled',
        'tool_blocked',
      ],
      'pii.action': [
        ...commonRules,
        'pii_action_allowed',
        'pii_denied',
      ],
      'k12.hint_access': [
        'hint_access_allowed',
        'hint_level',
        'hint_type',
      ],
      'k12.answer_reveal': [
        'answer_reveal_allowed',
        'answer_allowed',
      ],
      'k12.content': [
        'content_safety_passed',
        'content_blocked',
        'safety_action',
      ],
    };

    return actionRuleMap[action] || commonRules;
  }

  /**
   * Check if a specific rule matched
   */
  private ruleMatched(
    rule: string,
    input: PolicyInput,
    result: PolicyDecision | K12PolicyDecision
  ): boolean {
    // Simple heuristic matching based on result
    switch (rule) {
      case 'valid_user':
        return !!input.user?.id && !!input.user?.role;
      case 'ip_blocked':
        return 'deny_reasons' in result && result.deny_reasons.includes('ip_blocked');
      case 'rate_limit_exceeded':
        return 'deny_reasons' in result && result.deny_reasons.includes('rate_limit_exceeded');
      case 'pii_denied':
        return 'deny_reasons' in result && result.deny_reasons.includes('pii_denied');
      case 'requires_2fa':
        return input.policy_config?.require_2fa === true;
      case 'hint_access_allowed':
        return 'hint_level' in result && result.hint_level > 0;
      case 'answer_allowed':
        return 'answer_allowed' in result && result.answer_allowed;
      case 'content_blocked':
        return 'safety_action' in result && result.safety_action !== 'allow';
      default:
        return false;
    }
  }

  /**
   * Generate detailed explanation for deny reason
   */
  private explainDenyReason(
    reason: string,
    input: PolicyInput
  ): { reason: string; rule: string; inputs_used: Record<string, unknown> } {
    const explanations: Record<
      string,
      { rule: string; inputs: (input: PolicyInput) => Record<string, unknown> }
    > = {
      invalid_user: {
        rule: 'valid_user',
        inputs: (i) => ({
          'user.id': i.user?.id,
          'user.role': i.user?.role,
        }),
      },
      ip_blocked: {
        rule: 'ip_blocked',
        inputs: (i) => ({
          'context.ip_address': i.context.ip_address,
          'policy_config.ip_allowlist': i.policy_config?.ip_allowlist,
          'policy_config.ip_denylist': i.policy_config?.ip_denylist,
        }),
      },
      rate_limit_exceeded: {
        rule: 'rate_limit_exceeded',
        inputs: (i) => ({
          'context.request_count_minute': i.context.request_count_minute,
          'user.plan': i.user?.plan,
          calculated_rate_limit: this.getRateLimit(i.user?.plan || 'free'),
        }),
      },
      plan_limit_exceeded: {
        rule: 'plan_limit_exceeded',
        inputs: (i) => ({
          'context.current_memory_count': i.context.current_memory_count,
          'user.plan': i.user?.plan,
          calculated_limit: this.getMemoryLimit(i.user?.plan || 'free'),
        }),
      },
      pii_denied: {
        rule: 'pii_denied',
        inputs: (i) => ({
          'data.pii_detected': i.data?.pii_detected,
          'policy_config.pii_action': i.policy_config?.pii_action,
        }),
      },
      '2fa_required': {
        rule: 'requires_2fa',
        inputs: (i) => ({
          'user.has_2fa': i.user?.has_2fa,
          'policy_config.require_2fa': i.policy_config?.require_2fa,
        }),
      },
    };

    const exp = explanations[reason];
    if (exp) {
      return {
        reason,
        rule: exp.rule,
        inputs_used: exp.inputs(input),
      };
    }

    return {
      reason,
      rule: 'unknown',
      inputs_used: {},
    };
  }

  private getRateLimit(plan: string): number {
    const limits: Record<string, number> = {
      free: 60,
      starter: 120,
      plus: 300,
      pro: 600,
      enterprise: 3000,
    };
    return limits[plan] || 60;
  }

  private getMemoryLimit(plan: string): number {
    const limits: Record<string, number> = {
      free: 10000,
      starter: 50000,
      plus: 100000,
      pro: 1000000,
      enterprise: -1,
    };
    return limits[plan] || 10000;
  }

  /**
   * Run a single test case
   */
  async runTest(test: PolicyTestCase): Promise<PolicyTestResult> {
    const startTime = performance.now();

    // Simulate the policy
    const response = await this.simulate({
      input: test.input,
      explain: false,
    });

    const endTime = performance.now();

    // Compare expected vs actual
    const diff: Record<string, { expected: unknown; actual: unknown }> = {};
    let passed = true;

    for (const [key, expectedValue] of Object.entries(test.expected)) {
      const actualValue = (response.result as Record<string, unknown>)[key];

      if (JSON.stringify(expectedValue) !== JSON.stringify(actualValue)) {
        diff[key] = { expected: expectedValue, actual: actualValue };
        passed = false;
      }
    }

    return {
      name: test.name,
      passed,
      actual: response.result,
      expected: test.expected,
      diff: passed ? undefined : diff,
      duration_ms: endTime - startTime,
    };
  }

  /**
   * Run a full test suite
   */
  async runTestSuite(suite: PolicyTestSuite): Promise<PolicyTestSuiteResult> {
    const startTime = performance.now();
    const results: PolicyTestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const test of suite.tests) {
      const result = await this.runTest(test);
      results.push(result);

      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    const endTime = performance.now();

    return {
      suite: suite.name,
      total: suite.tests.length,
      passed,
      failed,
      results,
      duration_ms: endTime - startTime,
    };
  }
}

// ============================================
// Built-in Test Cases
// ============================================

export const BUILTIN_TEST_CASES: PolicyTestCase[] = [
  {
    name: 'allow_valid_memory_write',
    description: 'Valid user should be allowed to write memory',
    input: {
      action: 'memory.write',
      user: {
        id: 'user_123',
        role: 'member',
        plan: 'pro',
      },
      context: {
        timestamp: new Date().toISOString(),
        current_memory_count: 100,
      },
      data: {
        content: 'Test memory content',
        pii_detected: [],
      },
      policy_config: {
        pii_action: 'mask',
      },
    },
    expected: {
      allow: true,
      deny_reasons: [],
    },
  },
  {
    name: 'deny_invalid_user',
    description: 'Invalid user should be denied',
    input: {
      action: 'memory.write',
      user: {
        id: '',
        role: 'member',
        plan: 'free',
      },
      context: {
        timestamp: new Date().toISOString(),
      },
    },
    expected: {
      allow: false,
    },
  },
  {
    name: 'deny_pii_content',
    description: 'PII content should be denied when pii_action is deny',
    input: {
      action: 'memory.write',
      user: {
        id: 'user_123',
        role: 'member',
        plan: 'pro',
      },
      context: {
        timestamp: new Date().toISOString(),
      },
      data: {
        content: 'Email: test@example.com',
        pii_detected: ['email'],
      },
      policy_config: {
        pii_action: 'deny',
      },
    },
    expected: {
      allow: false,
    },
  },
  {
    name: 'mask_pii_content',
    description: 'PII content should trigger mask action',
    input: {
      action: 'memory.write',
      user: {
        id: 'user_123',
        role: 'member',
        plan: 'pro',
      },
      context: {
        timestamp: new Date().toISOString(),
      },
      data: {
        content: 'Email: test@example.com',
        pii_detected: ['email'],
      },
      policy_config: {
        pii_action: 'mask',
      },
    },
    expected: {
      allow: true,
      pii_action: 'mask',
    },
  },
  {
    name: 'deny_rate_limited',
    description: 'Requests exceeding rate limit should be denied',
    input: {
      action: 'memory.read',
      user: {
        id: 'user_123',
        role: 'member',
        plan: 'free',
      },
      context: {
        timestamp: new Date().toISOString(),
        request_count_minute: 100, // Exceeds free tier limit of 60
      },
    },
    expected: {
      allow: false,
    },
  },
  {
    name: 'k12_hint_allowed_tutor_mode',
    description: 'Student should get hints in tutor mode',
    input: {
      action: 'k12.hint_access',
      user: {
        id: 'student_123',
        role: 'student',
        plan: 'plus',
        grade_band: 'middle',
        workspace_id: 'ws_123',
      },
      context: {
        timestamp: new Date().toISOString(),
      },
      session: {
        mode: 'tutor',
        hints_used: 2,
      },
      policy_config: {
        max_hints: 5,
      },
    },
    expected: {
      allow: true,
      hint_level: 3,
    },
  },
  {
    name: 'k12_answer_denied_insufficient_attempts',
    description: 'Answer reveal should be denied without enough attempts',
    input: {
      action: 'k12.answer_reveal',
      user: {
        id: 'student_123',
        role: 'student',
        plan: 'plus',
        grade_band: 'middle',
      },
      context: {
        timestamp: new Date().toISOString(),
      },
      session: {
        mode: 'tutor',
        hints_used: 3,
        attempts: 1,
      },
      policy_config: {
        max_hints: 5,
        answer_reveal_allowed: true,
      },
    },
    expected: {
      answer_allowed: false,
    },
  },
];

// ============================================
// Default Simulator Instance
// ============================================

let defaultSimulator: PolicySimulator | null = null;

export function getDefaultSimulator(): PolicySimulator {
  if (!defaultSimulator) {
    defaultSimulator = new PolicySimulator();
  }
  return defaultSimulator;
}

/**
 * Quick simulation helper
 */
export async function simulatePolicy(
  request: PolicySimulationRequest
): Promise<PolicySimulationResponse> {
  const simulator = getDefaultSimulator();
  return simulator.simulate(request);
}

/**
 * Run built-in tests
 */
export async function runBuiltinTests(): Promise<PolicyTestSuiteResult> {
  const simulator = getDefaultSimulator();
  return simulator.runTestSuite({
    name: 'Seizn Built-in Policy Tests',
    tests: BUILTIN_TEST_CASES,
  });
}
