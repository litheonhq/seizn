/**
 * Seizn OPA Policy-as-Code
 *
 * Main entry point for OPA/Rego policy evaluation
 *
 * @example
 * ```typescript
 * import { evaluatePolicy, simulatePolicy, PolicyInput } from '@/lib/opa';
 *
 * const input: PolicyInput = {
 *   action: 'memory.write',
 *   user: { id: 'user_123', role: 'member', plan: 'pro' },
 *   context: { timestamp: new Date().toISOString() },
 *   data: { content: 'test', pii_detected: [] },
 * };
 *
 * const result = await evaluatePolicy(input);
 * if (result.decision.allow) {
 *   // Proceed with memory write
 * }
 * ```
 */

// ============================================
// Types
// ============================================

export type {
  // Core types
  PolicyAction,
  UserRole,
  PlanType,
  PiiAction,
  K12Role,
  GradeBand,
  SafetyLevel,

  // Input types
  PolicyUser,
  PolicyResource,
  PolicyContext,
  PolicySession,
  PolicyData,
  PolicyConfig,
  PolicyInput,

  // Output types
  PolicyDecision,
  K12PolicyDecision,

  // Evaluation types
  PolicyBundle,
  PolicyEvaluationOptions,
  PolicyEvaluationResult,
  PolicyTrace,

  // Simulation types
  PolicySimulationRequest,
  PolicySimulationResponse,
  PolicyExplanation,

  // Test types
  PolicyTestCase,
  PolicyTestResult,
  PolicyTestSuite,
  PolicyTestSuiteResult,

  // Management types
  PolicyDefinition,
  PolicyCompilationResult,
  PolicyCompilationError,
} from './types';

// ============================================
// Evaluator
// ============================================

export {
  PolicyEvaluator,
  getDefaultEvaluator,
  evaluatePolicy,
  evaluateK12Policy,
} from './evaluator';

// ============================================
// Simulator
// ============================================

export {
  PolicySimulator,
  getDefaultSimulator,
  simulatePolicy,
  runBuiltinTests,
  BUILTIN_TEST_CASES,
} from './simulator';

// ============================================
// Convenience Functions
// ============================================

import type { PolicyInput, PolicyDecision, K12PolicyDecision } from './types';
import { evaluatePolicy as _evaluatePolicy, evaluateK12Policy as _evaluateK12Policy } from './evaluator';

/**
 * Quick check if an action is allowed
 */
export async function isAllowed(input: PolicyInput): Promise<boolean> {
  const result = await _evaluatePolicy(input);
  return result.decision.allow;
}

/**
 * Quick check if an action is denied and get reasons
 */
export async function getDenyReasons(input: PolicyInput): Promise<string[]> {
  const result = await _evaluatePolicy(input);
  return result.decision.deny_reasons;
}

/**
 * Get PII action for a request
 */
export async function getPiiAction(input: PolicyInput): Promise<string> {
  const result = await _evaluatePolicy(input);
  return result.decision.pii_action;
}

/**
 * Get K-12 hint level for a session
 */
export async function getK12HintLevel(input: PolicyInput): Promise<number> {
  const result = await _evaluateK12Policy(input);
  return result.decision.hint_level;
}

/**
 * Check if K-12 answer reveal is allowed
 */
export async function isK12AnswerAllowed(input: PolicyInput): Promise<boolean> {
  const result = await _evaluateK12Policy(input);
  return result.decision.answer_allowed;
}

/**
 * Get K-12 safety action
 */
export async function getK12SafetyAction(
  input: PolicyInput
): Promise<'allow' | 'block' | 'block_and_notify_parent'> {
  const result = await _evaluateK12Policy(input);
  return result.decision.safety_action;
}

// ============================================
// Default Export
// ============================================

const opa = {
  evaluatePolicy: _evaluatePolicy,
  evaluateK12Policy: _evaluateK12Policy,
  isAllowed,
  getDenyReasons,
  getPiiAction,
  getK12HintLevel,
  isK12AnswerAllowed,
  getK12SafetyAction,
};

export default opa;
