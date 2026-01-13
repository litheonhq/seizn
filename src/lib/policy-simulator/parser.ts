/**
 * Seizn Policy Simulator - Parser
 *
 * Parses YAML/JSON policy definitions into structured rules.
 * Validates policy syntax and semantics.
 */

import YAML from 'yaml';
import type {
  PolicyRule,
  PolicyCondition,
  ConditionGroup,
  PolicyType,
  PolicyAction,
  ConditionOperator,
  ConditionFlag,
  MaskConfig,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types';

// ============================================
// Constants
// ============================================

const VALID_POLICY_TYPES: PolicyType[] = [
  'pii_masking',
  'access_control',
  'ttl',
  'scope',
  'content_filter',
];

const VALID_ACTIONS: PolicyAction[] = ['allow', 'block', 'mask', 'redact'];

const VALID_OPERATORS: ConditionOperator[] = [
  'contains',
  'not_contains',
  'matches',
  'not_matches',
  'equals',
  'not_equals',
  'in',
  'not_in',
  'starts_with',
  'ends_with',
  'greater_than',
  'less_than',
  'is_null',
  'is_not_null',
];

const VALID_FLAGS: ConditionFlag[] = [
  'case_insensitive',
  'trim_whitespace',
  'normalize_unicode',
];

const VALID_FIELDS = [
  'content',
  'metadata',
  'metadata.type',
  'metadata.source',
  'metadata.author',
  'metadata.date',
  'metadata.tags',
  'chunk.id',
  'chunk.source',
  'chunk.index',
  'chunk.size',
  'document.id',
  'document.name',
  'document.type',
  'user.id',
  'user.role',
  'user.groups',
  'query',
  'query.text',
  'query.intent',
];

// ============================================
// Parser Functions
// ============================================

/**
 * Parse YAML policy definition into structured rules
 */
export function parsePolicy(yaml: string): PolicyRule[] {
  if (!yaml || typeof yaml !== 'string') {
    throw new PolicyParseError('Policy YAML is required');
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(yaml);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid YAML syntax';
    throw new PolicyParseError(`Failed to parse YAML: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new PolicyParseError('Policy must be a valid YAML object');
  }

  const policyObj = parsed as Record<string, unknown>;

  // Handle different YAML structures
  if (Array.isArray(policyObj.rules)) {
    return parseRulesArray(policyObj.rules, policyObj.defaults as Record<string, unknown> | undefined);
  }

  // Single rule object
  if (policyObj.type && policyObj.action) {
    return [parseRule(policyObj, 0)];
  }

  throw new PolicyParseError('Policy must contain a "rules" array or be a single rule object');
}

/**
 * Parse JSON policy definition (for programmatic use)
 */
export function parsePolicyJson(json: unknown): PolicyRule[] {
  if (!json || typeof json !== 'object') {
    throw new PolicyParseError('Policy JSON must be an object');
  }

  const policyObj = json as Record<string, unknown>;

  if (Array.isArray(policyObj.rules)) {
    return parseRulesArray(policyObj.rules, policyObj.defaults as Record<string, unknown> | undefined);
  }

  if (policyObj.type && policyObj.action) {
    return [parseRule(policyObj, 0)];
  }

  throw new PolicyParseError('Policy must contain a "rules" array or be a single rule object');
}

/**
 * Parse an array of rules
 */
function parseRulesArray(
  rules: unknown[],
  defaults?: Record<string, unknown>
): PolicyRule[] {
  if (!Array.isArray(rules)) {
    throw new PolicyParseError('Rules must be an array');
  }

  return rules.map((rule, index) => {
    if (!rule || typeof rule !== 'object') {
      throw new PolicyParseError(`Rule at index ${index} must be an object`);
    }
    return parseRule(rule as Record<string, unknown>, index, defaults);
  });
}

/**
 * Parse a single rule
 */
function parseRule(
  rule: Record<string, unknown>,
  index: number,
  defaults?: Record<string, unknown>
): PolicyRule {
  // Required fields
  const type = rule.type as string;
  if (!type || !VALID_POLICY_TYPES.includes(type as PolicyType)) {
    throw new PolicyParseError(
      `Rule ${index}: "type" must be one of: ${VALID_POLICY_TYPES.join(', ')}`
    );
  }

  const action = (rule.action ?? defaults?.action) as string;
  if (!action || !VALID_ACTIONS.includes(action as PolicyAction)) {
    throw new PolicyParseError(
      `Rule ${index}: "action" must be one of: ${VALID_ACTIONS.join(', ')}`
    );
  }

  // Parse conditions
  const conditions = parseConditions(rule.conditions, index);

  // Optional fields
  const priority = typeof rule.priority === 'number'
    ? rule.priority
    : (typeof defaults?.priority === 'number' ? defaults.priority : index);

  const conditionGroups = rule.condition_groups || rule.conditionGroups;

  const parsed: PolicyRule = {
    id: rule.id as string | undefined,
    name: rule.name as string | undefined,
    description: rule.description as string | undefined,
    type: type as PolicyType,
    conditions,
    action: action as PolicyAction,
    priority,
    enabled: rule.enabled !== false,
  };

  // Parse condition groups if present
  if (conditionGroups && Array.isArray(conditionGroups)) {
    parsed.conditionGroups = conditionGroups.map((group, gIndex) =>
      parseConditionGroup(group as Record<string, unknown>, index, gIndex)
    );
  }

  // Parse mask config if action is mask/redact
  if ((action === 'mask' || action === 'redact') && rule.mask_config) {
    parsed.maskConfig = parseMaskConfig(rule.mask_config as Record<string, unknown>, index);
  }

  return parsed;
}

/**
 * Parse conditions array
 */
function parseConditions(
  conditions: unknown,
  ruleIndex: number
): PolicyCondition[] {
  if (!conditions) {
    return [];
  }

  if (!Array.isArray(conditions)) {
    throw new PolicyParseError(`Rule ${ruleIndex}: "conditions" must be an array`);
  }

  return conditions.map((cond, condIndex) => {
    if (!cond || typeof cond !== 'object') {
      throw new PolicyParseError(
        `Rule ${ruleIndex}, condition ${condIndex}: must be an object`
      );
    }
    return parseCondition(cond as Record<string, unknown>, ruleIndex, condIndex);
  });
}

/**
 * Parse a single condition
 */
function parseCondition(
  cond: Record<string, unknown>,
  ruleIndex: number,
  condIndex: number
): PolicyCondition {
  const field = cond.field as string;
  if (!field || typeof field !== 'string') {
    throw new PolicyParseError(
      `Rule ${ruleIndex}, condition ${condIndex}: "field" is required`
    );
  }

  const operator = cond.operator as string;
  if (!operator || !VALID_OPERATORS.includes(operator as ConditionOperator)) {
    throw new PolicyParseError(
      `Rule ${ruleIndex}, condition ${condIndex}: "operator" must be one of: ${VALID_OPERATORS.join(', ')}`
    );
  }

  // Value is not required for is_null/is_not_null operators
  const value = cond.value;
  if (value === undefined && !['is_null', 'is_not_null'].includes(operator)) {
    throw new PolicyParseError(
      `Rule ${ruleIndex}, condition ${condIndex}: "value" is required for operator "${operator}"`
    );
  }

  const parsed: PolicyCondition = {
    field,
    operator: operator as ConditionOperator,
    value: value as PolicyCondition['value'],
  };

  // Parse flags if present
  if (cond.flags) {
    if (!Array.isArray(cond.flags)) {
      throw new PolicyParseError(
        `Rule ${ruleIndex}, condition ${condIndex}: "flags" must be an array`
      );
    }

    const flags = cond.flags as string[];
    for (const flag of flags) {
      if (!VALID_FLAGS.includes(flag as ConditionFlag)) {
        throw new PolicyParseError(
          `Rule ${ruleIndex}, condition ${condIndex}: invalid flag "${flag}". Must be one of: ${VALID_FLAGS.join(', ')}`
        );
      }
    }
    parsed.flags = flags as ConditionFlag[];
  }

  return parsed;
}

/**
 * Parse a condition group
 */
function parseConditionGroup(
  group: Record<string, unknown>,
  ruleIndex: number,
  groupIndex: number
): ConditionGroup {
  const logic = group.logic as string;
  if (!logic || !['and', 'or'].includes(logic)) {
    throw new PolicyParseError(
      `Rule ${ruleIndex}, condition group ${groupIndex}: "logic" must be "and" or "or"`
    );
  }

  const conditions = group.conditions;
  if (!Array.isArray(conditions)) {
    throw new PolicyParseError(
      `Rule ${ruleIndex}, condition group ${groupIndex}: "conditions" must be an array`
    );
  }

  return {
    logic: logic as 'and' | 'or',
    conditions: conditions.map((item, index) => {
      const itemObj = item as Record<string, unknown>;
      // Nested group
      if (itemObj.logic && itemObj.conditions) {
        return parseConditionGroup(itemObj, ruleIndex, index);
      }
      // Regular condition
      return parseCondition(itemObj, ruleIndex, index);
    }),
  };
}

/**
 * Parse mask configuration
 */
function parseMaskConfig(
  config: Record<string, unknown>,
  ruleIndex: number
): MaskConfig {
  const maskType = config.mask_type || config.maskType;
  if (!maskType || !['partial', 'full', 'hash', 'tokenize'].includes(maskType as string)) {
    throw new PolicyParseError(
      `Rule ${ruleIndex}: mask_config.mask_type must be one of: partial, full, hash, tokenize`
    );
  }

  return {
    maskType: maskType as MaskConfig['maskType'],
    showStart: typeof config.show_start === 'number' ? config.show_start : config.showStart as number | undefined,
    showEnd: typeof config.show_end === 'number' ? config.show_end : config.showEnd as number | undefined,
    replacement: config.replacement as string | undefined,
    preserveFormat: config.preserve_format === true || config.preserveFormat === true,
  };
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate a policy definition
 */
export function validatePolicy(rules: PolicyRule[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!Array.isArray(rules)) {
    errors.push({
      path: 'rules',
      message: 'Policy rules must be an array',
      code: 'INVALID_RULES',
    });
    return { valid: false, errors, warnings };
  }

  if (rules.length === 0) {
    warnings.push({
      path: 'rules',
      message: 'Policy has no rules defined',
      code: 'EMPTY_RULES',
    });
  }

  // Validate each rule
  rules.forEach((rule, index) => {
    validateRule(rule, index, errors, warnings);
  });

  // Check for duplicate priorities
  const priorities = rules.map((r) => r.priority);
  const duplicatePriorities = priorities.filter(
    (p, i) => priorities.indexOf(p) !== i
  );
  if (duplicatePriorities.length > 0) {
    warnings.push({
      path: 'rules',
      message: `Duplicate priorities found: ${[...new Set(duplicatePriorities)].join(', ')}`,
      code: 'DUPLICATE_PRIORITIES',
    });
  }

  // Check for conflicting rules
  const conflicts = findConflictingRules(rules);
  for (const conflict of conflicts) {
    warnings.push({
      path: `rules[${conflict.index1}], rules[${conflict.index2}]`,
      message: conflict.message,
      code: 'CONFLICTING_RULES',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a single rule
 */
function validateRule(
  rule: PolicyRule,
  index: number,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  const path = `rules[${index}]`;

  // Validate type
  if (!VALID_POLICY_TYPES.includes(rule.type)) {
    errors.push({
      path: `${path}.type`,
      message: `Invalid policy type: ${rule.type}`,
      code: 'INVALID_TYPE',
    });
  }

  // Validate action
  if (!VALID_ACTIONS.includes(rule.action)) {
    errors.push({
      path: `${path}.action`,
      message: `Invalid action: ${rule.action}`,
      code: 'INVALID_ACTION',
    });
  }

  // Validate conditions
  if (rule.conditions.length === 0 && (!rule.conditionGroups || rule.conditionGroups.length === 0)) {
    warnings.push({
      path: `${path}.conditions`,
      message: 'Rule has no conditions - will match all chunks',
      code: 'NO_CONDITIONS',
    });
  }

  rule.conditions.forEach((cond, condIndex) => {
    validateCondition(cond, `${path}.conditions[${condIndex}]`, errors, warnings);
  });

  // Validate mask config if present
  if (rule.maskConfig && (rule.action === 'mask' || rule.action === 'redact')) {
    validateMaskConfig(rule.maskConfig, `${path}.maskConfig`, errors);
  }

  // Warn if mask config present but action is not mask/redact
  if (rule.maskConfig && rule.action !== 'mask' && rule.action !== 'redact') {
    warnings.push({
      path: `${path}.maskConfig`,
      message: 'mask_config is ignored when action is not mask or redact',
      code: 'UNUSED_MASK_CONFIG',
    });
  }
}

/**
 * Validate a condition
 */
function validateCondition(
  cond: PolicyCondition,
  path: string,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  // Validate field (warn if not in known list)
  if (!VALID_FIELDS.some((f) => cond.field === f || cond.field.startsWith(f + '.'))) {
    warnings.push({
      path: `${path}.field`,
      message: `Unknown field: "${cond.field}". This may be intentional for custom metadata.`,
      code: 'UNKNOWN_FIELD',
    });
  }

  // Validate operator
  if (!VALID_OPERATORS.includes(cond.operator)) {
    errors.push({
      path: `${path}.operator`,
      message: `Invalid operator: ${cond.operator}`,
      code: 'INVALID_OPERATOR',
    });
  }

  // Validate value type based on operator
  if (['in', 'not_in'].includes(cond.operator) && !Array.isArray(cond.value)) {
    errors.push({
      path: `${path}.value`,
      message: `Operator "${cond.operator}" requires an array value`,
      code: 'INVALID_VALUE_TYPE',
    });
  }

  if (['matches', 'not_matches'].includes(cond.operator)) {
    // Validate regex pattern
    try {
      new RegExp(cond.value as string);
    } catch {
      errors.push({
        path: `${path}.value`,
        message: `Invalid regex pattern: ${cond.value}`,
        code: 'INVALID_REGEX',
      });
    }
  }
}

/**
 * Validate mask configuration
 */
function validateMaskConfig(
  config: MaskConfig,
  path: string,
  errors: ValidationError[]
): void {
  if (config.maskType === 'partial') {
    if (config.showStart === undefined && config.showEnd === undefined) {
      errors.push({
        path,
        message: 'Partial masking requires showStart or showEnd',
        code: 'INVALID_MASK_CONFIG',
      });
    }
  }
}

/**
 * Find potentially conflicting rules
 */
function findConflictingRules(
  rules: PolicyRule[]
): { index1: number; index2: number; message: string }[] {
  const conflicts: { index1: number; index2: number; message: string }[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const rule1 = rules[i];
      const rule2 = rules[j];

      // Same type with different actions and overlapping conditions
      if (rule1.type === rule2.type && rule1.action !== rule2.action) {
        const overlap = checkConditionOverlap(rule1.conditions, rule2.conditions);
        if (overlap) {
          conflicts.push({
            index1: i,
            index2: j,
            message: `Rules ${i} and ${j} may conflict: same type "${rule1.type}" with different actions`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Check if two condition sets might overlap
 */
function checkConditionOverlap(
  conds1: PolicyCondition[],
  conds2: PolicyCondition[]
): boolean {
  // Simple check: if any condition targets the same field
  const fields1 = new Set(conds1.map((c) => c.field));
  const fields2 = new Set(conds2.map((c) => c.field));

  for (const field of fields1) {
    if (fields2.has(field)) {
      return true;
    }
  }

  return false;
}

// ============================================
// Serialization Functions
// ============================================

/**
 * Convert rules back to YAML format
 */
export function serializeToYaml(rules: PolicyRule[]): string {
  const policyObj = {
    version: '1.0',
    rules: rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      type: rule.type,
      action: rule.action,
      priority: rule.priority,
      enabled: rule.enabled,
      conditions: rule.conditions.map((cond) => ({
        field: cond.field,
        operator: cond.operator,
        value: cond.value,
        ...(cond.flags?.length ? { flags: cond.flags } : {}),
      })),
      ...(rule.conditionGroups?.length
        ? { condition_groups: rule.conditionGroups }
        : {}),
      ...(rule.maskConfig
        ? {
            mask_config: {
              mask_type: rule.maskConfig.maskType,
              show_start: rule.maskConfig.showStart,
              show_end: rule.maskConfig.showEnd,
              replacement: rule.maskConfig.replacement,
              preserve_format: rule.maskConfig.preserveFormat,
            },
          }
        : {}),
    })),
  };

  return YAML.stringify(policyObj, { indent: 2 });
}

/**
 * Convert rules to JSON format
 */
export function serializeToJson(rules: PolicyRule[]): Record<string, unknown> {
  return {
    version: '1.0',
    rules,
  };
}

// ============================================
// Error Classes
// ============================================

export class PolicyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyParseError';
  }
}
