/**
 * Seizn Winter - OPA Policy Evaluation Engine
 *
 * A lightweight Rego-compatible policy evaluation engine that:
 * - Parses and evaluates Rego-like policy rules
 * - Supports access control, data governance, and rate limiting
 * - Caches compiled policies for performance
 * - Provides detailed evaluation traces for debugging
 */

import type {
  OpaDecision,
  OpaInput,
  OpaPrincipal,
  OpaResource,
  OpaContext,
  PolicyCondition,
  RegoPolicy,
  RegoPolicyCategory,
  PolicyEvaluationRequest,
  PolicyEvaluationResponse,
  RateLimitResult,
  RateLimitSpec,
  PolicyValidationResult,
  PolicyValidationError,
} from './types';

// ============================================
// Policy Engine Core
// ============================================

/**
 * Compiled policy representation
 */
interface CompiledPolicy {
  id: string;
  name: string;
  category: RegoPolicyCategory;
  priority: number;
  rules: CompiledRule[];
  defaultDecision: boolean;
}

/**
 * Compiled rule representation
 */
interface CompiledRule {
  name: string;
  condition: RuleCondition;
  effect: 'allow' | 'deny';
  conditions?: PolicyCondition[];
  reason?: string;
}

/**
 * Rule condition types
 */
type RuleCondition =
  | { type: 'literal'; value: boolean }
  | { type: 'comparison'; left: ValueExpr; op: ComparisonOp; right: ValueExpr }
  | { type: 'membership'; value: ValueExpr; collection: ValueExpr }
  | { type: 'and'; conditions: RuleCondition[] }
  | { type: 'or'; conditions: RuleCondition[] }
  | { type: 'not'; condition: RuleCondition }
  | { type: 'exists'; path: string[] }
  | { type: 'match'; path: string[]; pattern: string };

type ComparisonOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | 'startsWith' | 'endsWith';

type ValueExpr =
  | { type: 'literal'; value: unknown }
  | { type: 'path'; segments: string[] }
  | { type: 'function'; name: string; args: ValueExpr[] };

// ============================================
// Policy Engine Implementation
// ============================================

export class OpaPolicyEngine {
  private compiledPolicies: Map<string, CompiledPolicy> = new Map();
  private evaluationCache: Map<string, { decision: OpaDecision; expiresAt: number }> = new Map();
  private cacheTtlMs: number = 5000; // 5 seconds default

  constructor(options?: { cacheTtlMs?: number }) {
    if (options?.cacheTtlMs) {
      this.cacheTtlMs = options.cacheTtlMs;
    }
  }

  /**
   * Load and compile policies
   */
  loadPolicies(policies: RegoPolicy[]): void {
    for (const policy of policies) {
      if (policy.isActive) {
        try {
          const compiled = this.compilePolicy(policy);
          this.compiledPolicies.set(policy.id, compiled);
        } catch (error) {
          console.error(`[OPA Engine] Failed to compile policy ${policy.id}:`, error);
        }
      }
    }
  }

  /**
   * Unload a policy
   */
  unloadPolicy(policyId: string): void {
    this.compiledPolicies.delete(policyId);
  }

  /**
   * Clear all loaded policies
   */
  clearPolicies(): void {
    this.compiledPolicies.clear();
    this.evaluationCache.clear();
  }

  /**
   * Evaluate policies against input
   */
  evaluate(request: PolicyEvaluationRequest): PolicyEvaluationResponse {
    const startTime = Date.now();
    const { input, policyIds, categories, includeAllDecisions } = request;

    // Check cache
    const cacheKey = this.getCacheKey(input);
    const cached = this.evaluationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        decision: cached.decision,
        stats: {
          totalPoliciesEvaluated: 0,
          evaluationTimeMs: 0,
          cacheHit: true,
        },
      };
    }

    // Get policies to evaluate
    const policiesToEvaluate = this.getPoliciesToEvaluate(policyIds, categories);

    // Sort by priority (higher first)
    policiesToEvaluate.sort((a, b) => b.priority - a.priority);

    // Evaluate each policy
    const policyDecisions: {
      policyId: string;
      policyName: string;
      decision: OpaDecision;
    }[] = [];

    let finalDecision: OpaDecision = {
      allow: true,
      metadata: {
        evaluatedAt: new Date().toISOString(),
        evaluationTimeMs: 0,
      },
    };

    for (const policy of policiesToEvaluate) {
      const decision = this.evaluatePolicy(policy, input);

      policyDecisions.push({
        policyId: policy.id,
        policyName: policy.name,
        decision,
      });

      // Aggregate decisions (deny takes precedence)
      if (!decision.allow) {
        finalDecision = {
          allow: false,
          reason: decision.reason || `Denied by policy: ${policy.name}`,
          conditions: decision.conditions,
          metadata: {
            policyId: policy.id,
            evaluatedAt: new Date().toISOString(),
            evaluationTimeMs: Date.now() - startTime,
          },
        };
        break; // Short-circuit on deny
      }

      // Merge conditions
      if (decision.conditions) {
        finalDecision.conditions = [
          ...(finalDecision.conditions || []),
          ...decision.conditions,
        ];
      }
    }

    // Update cache
    this.evaluationCache.set(cacheKey, {
      decision: finalDecision,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    // Update timing
    finalDecision.metadata = {
      ...finalDecision.metadata,
      evaluatedAt: new Date().toISOString(),
      evaluationTimeMs: Date.now() - startTime,
    };

    return {
      decision: finalDecision,
      policyDecisions: includeAllDecisions ? policyDecisions : undefined,
      stats: {
        totalPoliciesEvaluated: policiesToEvaluate.length,
        evaluationTimeMs: Date.now() - startTime,
        cacheHit: false,
      },
    };
  }

  /**
   * Validate Rego policy code
   */
  validatePolicy(regoCode: string): PolicyValidationResult {
    const errors: PolicyValidationError[] = [];
    const warnings: PolicyValidationError[] = [];

    try {
      // Basic syntax validation
      const lines = regoCode.split('\n');
      let hasPackage = false;
      let hasDefaultAllow = false;
      let braceCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNum = i + 1;

        // Check for package declaration
        if (line.startsWith('package ')) {
          hasPackage = true;
        }

        // Check for default allow
        if (line.startsWith('default allow')) {
          hasDefaultAllow = true;
        }

        // Track braces
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;

        // Check for common errors
        if (line.includes('==') && !line.includes(':=') && !line.includes('{')) {
          // Likely missing rule body
          if (!line.endsWith('{') && !lines[i + 1]?.trim().startsWith('{')) {
            warnings.push({
              line: lineNum,
              message: 'Condition without rule body. Consider adding a rule body with { }',
              code: 'W001',
            });
          }
        }

        // Check for undefined variables
        const varMatch = line.match(/input\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/);
        if (varMatch) {
          // Valid input paths
          const validPaths = [
            'principal', 'resource', 'action', 'context', 'data',
            'principal.type', 'principal.id', 'principal.organizationId', 'principal.roles',
            'resource.type', 'resource.id', 'resource.ownerId', 'resource.organizationId',
            'action.operation', 'action.method', 'action.endpoint',
            'context.timestamp', 'context.ipAddress', 'context.rateLimit',
          ];
          const path = `input.${varMatch[1]}`.split('.').slice(0, 3).join('.');
          if (!validPaths.some((p) => path.startsWith(p) || p.startsWith(path))) {
            warnings.push({
              line: lineNum,
              message: `Unknown input path: ${varMatch[0]}`,
              code: 'W002',
            });
          }
        }
      }

      // Check for balanced braces
      if (braceCount !== 0) {
        errors.push({
          message: `Unbalanced braces: ${braceCount > 0 ? 'missing closing' : 'extra closing'} brace`,
          code: 'E001',
        });
      }

      // Check for required elements
      if (!hasPackage) {
        errors.push({
          message: 'Missing package declaration',
          code: 'E002',
        });
      }

      if (!hasDefaultAllow) {
        warnings.push({
          message: 'No default allow rule. Consider adding: default allow := false',
          code: 'W003',
        });
      }

      // Try to parse the policy
      this.parseRegoPolicy(regoCode);
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : 'Unknown parse error',
        code: 'E999',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private compilePolicy(policy: RegoPolicy): CompiledPolicy {
    const rules = this.parseRegoPolicy(policy.regoCode);

    return {
      id: policy.id,
      name: policy.name,
      category: policy.category,
      priority: policy.priority,
      rules,
      defaultDecision: false, // Default deny
    };
  }

  private parseRegoPolicy(regoCode: string): CompiledRule[] {
    const rules: CompiledRule[] = [];
    const lines = regoCode.split('\n');

    let currentRule: Partial<CompiledRule> | null = null;
    let conditionBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('#') || line.startsWith('//')) {
        continue;
      }

      // Skip package and import declarations
      if (line.startsWith('package ') || line.startsWith('import ')) {
        continue;
      }

      // Parse default rules
      if (line.startsWith('default allow')) {
        const match = line.match(/default allow\s*:?=\s*(true|false)/);
        if (match) {
          rules.push({
            name: 'default',
            condition: { type: 'literal', value: true },
            effect: match[1] === 'true' ? 'allow' : 'deny',
          });
        }
        continue;
      }

      // Parse allow/deny rules
      const ruleMatch = line.match(/^(allow|deny)(?:\s*:?=\s*true)?\s*(?:\{|if\s*\{?)?/);
      if (ruleMatch) {
        // Save previous rule if exists
        if (currentRule && conditionBuffer.length > 0) {
          currentRule.condition = this.parseConditions(conditionBuffer);
          rules.push(currentRule as CompiledRule);
        }

        currentRule = {
          name: ruleMatch[1],
          effect: ruleMatch[1] as 'allow' | 'deny',
        };
        conditionBuffer = [];

        // Check for inline condition
        const inlineCondition = line.replace(ruleMatch[0], '').trim();
        if (inlineCondition && inlineCondition !== '{') {
          conditionBuffer.push(inlineCondition.replace(/^\{|\}$/g, '').trim());
        }
        continue;
      }

      // Collect conditions
      if (currentRule && line !== '}') {
        const cleanedLine = line.replace(/^\{|\}$/g, '').trim();
        if (cleanedLine) {
          conditionBuffer.push(cleanedLine);
        }
      }

      // End of rule block
      if (line === '}' && currentRule) {
        if (conditionBuffer.length > 0) {
          currentRule.condition = this.parseConditions(conditionBuffer);
        } else {
          currentRule.condition = { type: 'literal', value: true };
        }
        rules.push(currentRule as CompiledRule);
        currentRule = null;
        conditionBuffer = [];
      }
    }

    // Handle any remaining rule
    if (currentRule) {
      if (conditionBuffer.length > 0) {
        currentRule.condition = this.parseConditions(conditionBuffer);
      } else {
        currentRule.condition = { type: 'literal', value: true };
      }
      rules.push(currentRule as CompiledRule);
    }

    return rules;
  }

  private parseConditions(conditions: string[]): RuleCondition {
    if (conditions.length === 0) {
      return { type: 'literal', value: true };
    }

    if (conditions.length === 1) {
      return this.parseCondition(conditions[0]);
    }

    // Multiple conditions are ANDed together
    return {
      type: 'and',
      conditions: conditions.map((c) => this.parseCondition(c)),
    };
  }

  private parseCondition(conditionStr: string): RuleCondition {
    const trimmed = conditionStr.trim();

    // Handle boolean literals
    if (trimmed === 'true') return { type: 'literal', value: true };
    if (trimmed === 'false') return { type: 'literal', value: false };

    // Handle NOT conditions
    if (trimmed.startsWith('not ')) {
      return {
        type: 'not',
        condition: this.parseCondition(trimmed.slice(4)),
      };
    }

    // Handle membership (in)
    const inMatch = trimmed.match(/^(.+?)\s+in\s+(.+)$/);
    if (inMatch) {
      return {
        type: 'membership',
        value: this.parseValue(inMatch[1].trim()),
        collection: this.parseValue(inMatch[2].trim()),
      };
    }

    // Handle comparisons
    const compOps: ComparisonOp[] = ['==', '!=', '<=', '>=', '<', '>'];
    for (const op of compOps) {
      const parts = trimmed.split(op);
      if (parts.length === 2) {
        return {
          type: 'comparison',
          left: this.parseValue(parts[0].trim()),
          op,
          right: this.parseValue(parts[1].trim()),
        };
      }
    }

    // Handle string methods (contains, startsWith, endsWith)
    const methodMatch = trimmed.match(
      /^(contains|startswith|endswith)\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)$/i
    );
    if (methodMatch) {
      const op =
        methodMatch[1].toLowerCase() === 'contains'
          ? 'contains'
          : methodMatch[1].toLowerCase() === 'startswith'
            ? 'startsWith'
            : 'endsWith';
      return {
        type: 'comparison',
        left: this.parseValue(methodMatch[2].trim()),
        op,
        right: this.parseValue(methodMatch[3].trim()),
      };
    }

    // Handle exists check (simple path reference)
    if (trimmed.startsWith('input.') || trimmed.startsWith('data.')) {
      return {
        type: 'exists',
        path: trimmed.split('.'),
      };
    }

    // Default to literal
    return { type: 'literal', value: Boolean(trimmed) };
  }

  private parseValue(valueStr: string): ValueExpr {
    const trimmed = valueStr.trim();

    // String literal
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return { type: 'literal', value: trimmed.slice(1, -1) };
    }

    // Number literal
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { type: 'literal', value: parseFloat(trimmed) };
    }

    // Boolean literal
    if (trimmed === 'true') return { type: 'literal', value: true };
    if (trimmed === 'false') return { type: 'literal', value: false };
    if (trimmed === 'null') return { type: 'literal', value: null };

    // Array literal
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const content = trimmed.slice(1, -1);
      const items = content.split(',').map((s) => {
        const parsed = this.parseValue(s.trim());
        return parsed.type === 'literal' ? parsed.value : s.trim();
      });
      return { type: 'literal', value: items };
    }

    // Path reference
    if (trimmed.includes('.')) {
      return { type: 'path', segments: trimmed.split('.') };
    }

    // Simple variable reference
    return { type: 'path', segments: [trimmed] };
  }

  private evaluatePolicy(policy: CompiledPolicy, input: OpaInput): OpaDecision {
    let decision: OpaDecision = {
      allow: policy.defaultDecision,
    };

    for (const rule of policy.rules) {
      const result = this.evaluateRule(rule, input);

      if (result) {
        decision = {
          allow: rule.effect === 'allow',
          reason: rule.reason,
          conditions: rule.conditions,
        };

        // For deny rules, short-circuit
        if (rule.effect === 'deny') {
          break;
        }
      }
    }

    return decision;
  }

  private evaluateRule(rule: CompiledRule, input: OpaInput): boolean {
    return this.evaluateCondition(rule.condition, input);
  }

  private evaluateCondition(condition: RuleCondition, input: OpaInput): boolean {
    switch (condition.type) {
      case 'literal':
        return Boolean(condition.value);

      case 'comparison': {
        const left = this.resolveValue(condition.left, input);
        const right = this.resolveValue(condition.right, input);
        return this.compare(left, condition.op, right);
      }

      case 'membership': {
        const value = this.resolveValue(condition.value, input);
        const collection = this.resolveValue(condition.collection, input);
        if (Array.isArray(collection)) {
          return collection.includes(value);
        }
        return false;
      }

      case 'and':
        return condition.conditions.every((c) => this.evaluateCondition(c, input));

      case 'or':
        return condition.conditions.some((c) => this.evaluateCondition(c, input));

      case 'not':
        return !this.evaluateCondition(condition.condition, input);

      case 'exists': {
        const value = this.resolvePath(condition.path, input);
        return value !== undefined && value !== null;
      }

      case 'match': {
        const value = this.resolvePath(condition.path, input);
        if (typeof value !== 'string') return false;
        const regex = new RegExp(condition.pattern);
        return regex.test(value);
      }

      default:
        return false;
    }
  }

  private resolveValue(expr: ValueExpr, input: OpaInput): unknown {
    switch (expr.type) {
      case 'literal':
        return expr.value;

      case 'path':
        return this.resolvePath(expr.segments, input);

      case 'function':
        return this.callFunction(expr.name, expr.args, input);

      default:
        return undefined;
    }
  }

  private resolvePath(segments: string[], input: OpaInput): unknown {
    // Build evaluation context
    const context: Record<string, unknown> = {
      input: {
        principal: input.principal,
        resource: input.resource,
        action: input.action,
        context: input.context,
        data: input.data,
      },
      data: input.data,
    };

    let current: unknown = context;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof current === 'object' && segment in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private callFunction(name: string, args: ValueExpr[], input: OpaInput): unknown {
    const resolvedArgs = args.map((a) => this.resolveValue(a, input));

    switch (name) {
      case 'count':
        return Array.isArray(resolvedArgs[0]) ? resolvedArgs[0].length : 0;

      case 'lower':
        return typeof resolvedArgs[0] === 'string' ? resolvedArgs[0].toLowerCase() : '';

      case 'upper':
        return typeof resolvedArgs[0] === 'string' ? resolvedArgs[0].toUpperCase() : '';

      case 'time.now_ns':
        return Date.now() * 1000000;

      default:
        return undefined;
    }
  }

  private compare(left: unknown, op: ComparisonOp, right: unknown): boolean {
    switch (op) {
      case '==':
        return left === right;

      case '!=':
        return left !== right;

      case '<':
        return typeof left === 'number' && typeof right === 'number' && left < right;

      case '<=':
        return typeof left === 'number' && typeof right === 'number' && left <= right;

      case '>':
        return typeof left === 'number' && typeof right === 'number' && left > right;

      case '>=':
        return typeof left === 'number' && typeof right === 'number' && left >= right;

      case 'contains':
        return typeof left === 'string' && typeof right === 'string' && left.includes(right);

      case 'startsWith':
        return typeof left === 'string' && typeof right === 'string' && left.startsWith(right);

      case 'endsWith':
        return typeof left === 'string' && typeof right === 'string' && left.endsWith(right);

      default:
        return false;
    }
  }

  private getPoliciesToEvaluate(
    policyIds?: string[],
    categories?: RegoPolicyCategory[]
  ): CompiledPolicy[] {
    const policies: CompiledPolicy[] = [];

    this.compiledPolicies.forEach((policy) => {
      // Filter by ID if specified
      if (policyIds && !policyIds.includes(policy.id)) {
        return;
      }

      // Filter by category if specified
      if (categories && !categories.includes(policy.category)) {
        return;
      }

      policies.push(policy);
    });

    return policies;
  }

  private getCacheKey(input: OpaInput): string {
    return JSON.stringify({
      principal: input.principal?.id,
      principalType: input.principal?.type,
      resource: input.resource?.type,
      resourceId: input.resource?.id,
      action: input.action?.operation,
    });
  }
}

// ============================================
// Rate Limiter
// ============================================

/**
 * Rate limiter with configurable rules
 */
export class OpaRateLimiter {
  private counters: Map<string, { count: number; windowStart: number }> = new Map();

  /**
   * Check rate limit
   */
  checkRateLimit(
    key: string,
    spec: RateLimitSpec,
    currentTime: number = Date.now()
  ): RateLimitResult {
    const counter = this.counters.get(key);
    const windowMs = spec.windowSeconds * 1000;

    if (!counter || currentTime - counter.windowStart >= windowMs) {
      // New window
      this.counters.set(key, { count: 1, windowStart: currentTime });
      return {
        allowed: true,
        remaining: spec.maxRequests - 1,
        resetAt: new Date(currentTime + windowMs).toISOString(),
      };
    }

    // Check limit
    const remaining = spec.maxRequests - counter.count - 1;

    if (remaining < 0) {
      // Check burst allowance
      if (spec.burst && counter.count < spec.maxRequests + spec.burst) {
        counter.count++;
        return {
          allowed: true,
          remaining: spec.maxRequests + spec.burst - counter.count,
          resetAt: new Date(counter.windowStart + windowMs).toISOString(),
          appliedRule: 'burst',
        };
      }

      const retryAfterSeconds = Math.ceil(
        (counter.windowStart + windowMs - currentTime) / 1000
      );

      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(counter.windowStart + windowMs).toISOString(),
        retryAfterSeconds: spec.penaltySeconds || retryAfterSeconds,
      };
    }

    counter.count++;
    return {
      allowed: true,
      remaining: Math.max(0, remaining),
      resetAt: new Date(counter.windowStart + windowMs).toISOString(),
    };
  }

  /**
   * Reset a rate limit counter
   */
  reset(key: string): void {
    this.counters.delete(key);
  }

  /**
   * Clear all counters
   */
  clearAll(): void {
    this.counters.clear();
  }

  /**
   * Get current count for a key
   */
  getCount(key: string): number {
    return this.counters.get(key)?.count || 0;
  }
}

// ============================================
// Singleton Instance
// ============================================

let engineInstance: OpaPolicyEngine | null = null;
let rateLimiterInstance: OpaRateLimiter | null = null;

export function getOpaPolicyEngine(): OpaPolicyEngine {
  if (!engineInstance) {
    engineInstance = new OpaPolicyEngine();
  }
  return engineInstance;
}

export function getOpaRateLimiter(): OpaRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new OpaRateLimiter();
  }
  return rateLimiterInstance;
}
