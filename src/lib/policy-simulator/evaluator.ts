/**
 * Seizn Policy Simulator - Evaluator
 *
 * Evaluates policy rules against chunks to determine actions.
 * Supports PII masking, access control, content filtering, TTL, and scope policies.
 */

import type {
  PolicyRule,
  PolicyCondition,
  ConditionGroup,
  PolicyAction,
  ChunkRef,
  EvaluationResult,
  BatchEvaluationResult,
  MaskConfig,
} from './types';

// ============================================
// Main Evaluation Functions
// ============================================

/**
 * Evaluate a single chunk against policy rules
 * Returns the action to take and any transformations
 */
export function evaluatePolicy(
  chunk: ChunkRef,
  rules: PolicyRule[],
  context?: EvaluationContext
): EvaluationResult {
  const matchedRules: string[] = [];
  let finalAction: PolicyAction = 'allow';
  let maskedContent: string | undefined;
  let maskedFields: string[] | undefined;
  let explanation: string | undefined;

  // Sort rules by priority (higher = evaluated first)
  const sortedRules = [...rules]
    .filter((r) => r.enabled !== false)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    const match = evaluateRule(chunk, rule, context);

    if (match.matched) {
      const ruleId = rule.id || rule.name || `rule_${rules.indexOf(rule)}`;
      matchedRules.push(ruleId);

      // Apply the action (first match wins for block/allow, accumulate for mask)
      if (rule.action === 'block') {
        finalAction = 'block';
        explanation = match.reason || `Blocked by rule: ${ruleId}`;
        break; // Block takes precedence
      } else if (rule.action === 'mask' || rule.action === 'redact') {
        finalAction = rule.action;
        const maskResult = applyMasking(chunk.content, rule.maskConfig, match.matchedValues);
        maskedContent = maskResult.content;
        maskedFields = maskResult.fields;
        explanation = match.reason || `Masked by rule: ${ruleId}`;
      } else if (rule.action === 'allow') {
        // Explicit allow - continue checking other rules
        if (!explanation) {
          explanation = match.reason || `Allowed by rule: ${ruleId}`;
        }
      }
    }
  }

  return {
    chunkId: chunk.id,
    action: finalAction,
    matchedRules,
    maskedContent,
    maskedFields,
    explanation,
    confidence: matchedRules.length > 0 ? 1.0 : 0.5,
  };
}

/**
 * Evaluate multiple chunks against policy rules
 */
export function evaluatePolicyBatch(
  chunks: ChunkRef[],
  rules: PolicyRule[],
  context?: EvaluationContext
): BatchEvaluationResult {
  const startTime = Date.now();

  const results = chunks.map((chunk) => evaluatePolicy(chunk, rules, context));

  const summary = {
    total: results.length,
    allowed: results.filter((r) => r.action === 'allow').length,
    blocked: results.filter((r) => r.action === 'block').length,
    masked: results.filter((r) => r.action === 'mask').length,
    redacted: results.filter((r) => r.action === 'redact').length,
  };

  return {
    results,
    summary,
    processingTimeMs: Date.now() - startTime,
  };
}

// ============================================
// Rule Evaluation
// ============================================

interface RuleMatchResult {
  matched: boolean;
  reason?: string;
  matchedValues?: string[];
}

/**
 * Evaluate a single rule against a chunk
 */
function evaluateRule(
  chunk: ChunkRef,
  rule: PolicyRule,
  context?: EvaluationContext
): RuleMatchResult {
  const matchedValues: string[] = [];

  // Evaluate regular conditions (AND logic)
  for (const condition of rule.conditions) {
    const result = evaluateCondition(chunk, condition, context);
    if (!result.matched) {
      return { matched: false };
    }
    if (result.matchedValue) {
      matchedValues.push(result.matchedValue);
    }
  }

  // Evaluate condition groups if present
  if (rule.conditionGroups && rule.conditionGroups.length > 0) {
    for (const group of rule.conditionGroups) {
      if (!evaluateConditionGroup(chunk, group, context)) {
        return { matched: false };
      }
    }
  }

  // If no conditions, rule matches everything
  return {
    matched: true,
    reason: `Matched rule: ${rule.name || rule.id || 'unnamed'}`,
    matchedValues,
  };
}

/**
 * Evaluate a condition group
 */
function evaluateConditionGroup(
  chunk: ChunkRef,
  group: ConditionGroup,
  context?: EvaluationContext
): boolean {
  const results = group.conditions.map((item) => {
    if ('logic' in item) {
      // Nested group
      return evaluateConditionGroup(chunk, item as ConditionGroup, context);
    }
    // Regular condition
    return evaluateCondition(chunk, item as PolicyCondition, context).matched;
  });

  if (group.logic === 'and') {
    return results.every((r) => r);
  } else {
    return results.some((r) => r);
  }
}

// ============================================
// Condition Evaluation
// ============================================

interface ConditionResult {
  matched: boolean;
  matchedValue?: string;
}

/**
 * Evaluate a single condition against a chunk
 */
function evaluateCondition(
  chunk: ChunkRef,
  condition: PolicyCondition,
  context?: EvaluationContext
): ConditionResult {
  // Get the field value
  const fieldValue = getFieldValue(chunk, condition.field, context);

  // Apply flags
  let compareValue = condition.value;
  let actualValue = fieldValue;

  if (condition.flags?.includes('case_insensitive')) {
    if (typeof actualValue === 'string') {
      actualValue = actualValue.toLowerCase();
    }
    if (typeof compareValue === 'string') {
      compareValue = compareValue.toLowerCase();
    }
    if (Array.isArray(compareValue)) {
      compareValue = (compareValue.map((v) =>
        typeof v === 'string' ? v.toLowerCase() : v
      )) as string[] | number[];
    }
  }

  if (condition.flags?.includes('trim_whitespace')) {
    if (typeof actualValue === 'string') {
      actualValue = actualValue.trim();
    }
    if (typeof compareValue === 'string') {
      compareValue = compareValue.trim();
    }
  }

  // Evaluate based on operator
  const result = evaluateOperator(
    condition.operator,
    actualValue,
    compareValue
  );

  return {
    matched: result,
    matchedValue: result && typeof fieldValue === 'string' ? fieldValue : undefined,
  };
}

/**
 * Get field value from chunk or context
 */
function getFieldValue(
  chunk: ChunkRef,
  field: string,
  context?: EvaluationContext
): unknown {
  const parts = field.split('.');

  // Handle top-level fields
  switch (parts[0]) {
    case 'content':
      return chunk.content;

    case 'metadata':
      if (parts.length === 1) return chunk.metadata;
      return getNestedValue(chunk.metadata, parts.slice(1));

    case 'chunk':
      if (parts[1] === 'id') return chunk.id;
      if (parts[1] === 'source') return chunk.source;
      if (parts[1] === 'index') return chunk.metadata?.index;
      if (parts[1] === 'size') return chunk.content?.length;
      return getNestedValue(chunk, parts.slice(1));

    case 'document':
      if (parts[1] === 'id') return chunk.documentId;
      return getNestedValue(chunk.metadata?.document, parts.slice(1));

    case 'user':
      if (!context?.user) return undefined;
      if (parts[1] === 'id') return context.user.id;
      if (parts[1] === 'role') return context.user.role;
      if (parts[1] === 'groups') return context.user.groups;
      return getNestedValue(context.user, parts.slice(1));

    case 'query':
      if (!context?.query) return undefined;
      if (parts.length === 1) return context.query.text;
      if (parts[1] === 'text') return context.query.text;
      if (parts[1] === 'intent') return context.query.intent;
      return getNestedValue(context.query, parts.slice(1));

    default:
      // Try as nested metadata field
      return getNestedValue(chunk.metadata, parts);
  }
}

/**
 * Get nested value from object using path parts
 */
function getNestedValue(obj: unknown, parts: string[]): unknown {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate an operator
 */
function evaluateOperator(
  operator: string,
  actualValue: unknown,
  compareValue: unknown
): boolean {
  // Handle null checks first
  if (operator === 'is_null') {
    return actualValue === null || actualValue === undefined;
  }
  if (operator === 'is_not_null') {
    return actualValue !== null && actualValue !== undefined;
  }

  // Convert to string for string operations
  const actualStr = actualValue?.toString() ?? '';

  switch (operator) {
    case 'equals':
      return actualValue === compareValue;

    case 'not_equals':
      return actualValue !== compareValue;

    case 'contains':
      if (typeof compareValue === 'string') {
        return actualStr.includes(compareValue);
      }
      if (Array.isArray(actualValue)) {
        return actualValue.includes(compareValue);
      }
      return false;

    case 'not_contains':
      if (typeof compareValue === 'string') {
        return !actualStr.includes(compareValue);
      }
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(compareValue);
      }
      return true;

    case 'matches':
      try {
        const regex = new RegExp(compareValue as string);
        return regex.test(actualStr);
      } catch {
        return false;
      }

    case 'not_matches':
      try {
        const regex = new RegExp(compareValue as string);
        return !regex.test(actualStr);
      } catch {
        return true;
      }

    case 'in':
      if (Array.isArray(compareValue)) {
        return compareValue.includes(actualValue);
      }
      return false;

    case 'not_in':
      if (Array.isArray(compareValue)) {
        return !compareValue.includes(actualValue);
      }
      return true;

    case 'starts_with':
      return actualStr.startsWith(compareValue as string);

    case 'ends_with':
      return actualStr.endsWith(compareValue as string);

    case 'greater_than':
      if (typeof actualValue === 'number' && typeof compareValue === 'number') {
        return actualValue > compareValue;
      }
      return actualStr > String(compareValue);

    case 'less_than':
      if (typeof actualValue === 'number' && typeof compareValue === 'number') {
        return actualValue < compareValue;
      }
      return actualStr < String(compareValue);

    default:
      return false;
  }
}

// ============================================
// Masking Functions
// ============================================

interface MaskingResult {
  content: string;
  fields: string[];
}

/**
 * Apply masking to content based on config
 */
function applyMasking(
  content: string,
  config?: MaskConfig,
  matchedValues?: string[]
): MaskingResult {
  const fields: string[] = [];

  if (!config) {
    // Default: full redaction
    return {
      content: '[REDACTED]',
      fields: ['content'],
    };
  }

  let result = content;

  // Mask matched values
  if (matchedValues && matchedValues.length > 0) {
    for (const value of matchedValues) {
      result = maskValue(result, value, config);
      fields.push('matched_value');
    }
  }

  // Apply masking type
  switch (config.maskType) {
    case 'full':
      result = config.replacement ?? '[REDACTED]';
      fields.push('content');
      break;

    case 'partial':
      result = partialMask(result, config.showStart ?? 0, config.showEnd ?? 0);
      fields.push('content');
      break;

    case 'hash':
      result = hashContent(result);
      fields.push('content');
      break;

    case 'tokenize':
      result = tokenizeContent(result);
      fields.push('content');
      break;
  }

  return { content: result, fields };
}

/**
 * Mask a specific value in content
 */
function maskValue(content: string, value: string, config: MaskConfig): string {
  if (!value) return content;

  const replacement = config.maskType === 'partial'
    ? partialMask(value, config.showStart ?? 0, config.showEnd ?? 0)
    : config.replacement ?? '***';

  return content.replace(new RegExp(escapeRegex(value), 'g'), replacement);
}

/**
 * Apply partial masking (show start/end characters)
 */
function partialMask(text: string, showStart: number, showEnd: number): string {
  if (text.length <= showStart + showEnd) {
    return '*'.repeat(text.length);
  }

  const start = text.slice(0, showStart);
  const end = text.slice(-showEnd || undefined);
  const middle = '*'.repeat(Math.max(1, text.length - showStart - showEnd));

  return showEnd > 0 ? `${start}${middle}${end}` : `${start}${middle}`;
}

/**
 * Hash content for tokenization
 */
function hashContent(content: string): string {
  // Simple hash for demonstration - use crypto.subtle in production
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `[HASH:${Math.abs(hash).toString(16).padStart(8, '0')}]`;
}

/**
 * Tokenize content (replace with consistent tokens)
 */
function tokenizeContent(content: string): string {
  const hash = hashContent(content);
  return `[TOKEN:${hash.slice(6, 14)}]`;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================
// Context Types
// ============================================

export interface EvaluationContext {
  user?: {
    id: string;
    role?: string;
    groups?: string[];
  };
  query?: {
    text: string;
    intent?: string;
  };
  timestamp?: Date;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get statistics about rule evaluation
 */
export function getEvaluationStats(results: EvaluationResult[]): {
  totalChunks: number;
  byAction: Record<PolicyAction, number>;
  rulesActivated: Map<string, number>;
} {
  const byAction: Record<PolicyAction, number> = {
    allow: 0,
    block: 0,
    mask: 0,
    redact: 0,
  };

  const rulesActivated = new Map<string, number>();

  for (const result of results) {
    byAction[result.action]++;

    for (const rule of result.matchedRules) {
      rulesActivated.set(rule, (rulesActivated.get(rule) || 0) + 1);
    }
  }

  return {
    totalChunks: results.length,
    byAction,
    rulesActivated,
  };
}

/**
 * Filter chunks based on evaluation results
 */
export function filterChunksByPolicy(
  chunks: ChunkRef[],
  results: EvaluationResult[]
): {
  allowed: ChunkRef[];
  blocked: ChunkRef[];
  masked: { chunk: ChunkRef; maskedContent: string }[];
} {
  const allowed: ChunkRef[] = [];
  const blocked: ChunkRef[] = [];
  const masked: { chunk: ChunkRef; maskedContent: string }[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const result = results[i];

    switch (result.action) {
      case 'allow':
        allowed.push(chunk);
        break;
      case 'block':
        blocked.push(chunk);
        break;
      case 'mask':
      case 'redact':
        if (result.maskedContent) {
          masked.push({ chunk, maskedContent: result.maskedContent });
        } else {
          allowed.push(chunk);
        }
        break;
    }
  }

  return { allowed, blocked, masked };
}
