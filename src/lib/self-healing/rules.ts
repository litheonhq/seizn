/**
 * Self-Healing Rules Engine
 *
 * Evaluates and manages healing rules for automatic issue resolution.
 * Supports condition-based triggers, scheduled execution, and action configuration.
 */

import { createServerClient } from '@/lib/supabase';
import {
  HealingRule,
  RuleCondition,
  RuleActionParams,
  HealingActionType,
  TriggerOperator,
  IndexHealth,
  IndexIssue,
  IssueType,
  IssueSeverity,
  RuleRequest,
  DEFAULT_HEALING_CONFIG,
} from './types';

// ============================================
// Rule CRUD Operations
// ============================================

/**
 * Create a new healing rule
 */
export async function createRule(
  userId: string,
  request: RuleRequest
): Promise<HealingRule> {
  const supabase = createServerClient();

  // Calculate next execution time if auto-execute is enabled
  let nextExecutionAt: string | undefined;
  if (request.autoExecute && request.scheduleCron) {
    nextExecutionAt = calculateNextExecution(request.scheduleCron);
  }

  const { data: rule, error } = await supabase
    .from('healing_rules')
    .insert({
      user_id: userId,
      collection_id: request.collectionId,
      name: request.name,
      description: request.description,
      trigger_condition: request.triggerCondition,
      trigger_operator: 'AND',
      conditions: request.conditions ?? [],
      action: request.action,
      action_params: request.actionParams ?? {},
      auto_execute: request.autoExecute ?? false,
      schedule_cron: request.scheduleCron,
      next_execution_at: nextExecutionAt,
      max_chunks_per_run: request.maxChunksPerRun ?? 1000,
      is_active: true,
    })
    .select('*')
    .single();

  if (error || !rule) {
    throw new Error(`Failed to create rule: ${error?.message}`);
  }

  return mapRuleFromDb(rule);
}

/**
 * Update an existing rule
 */
export async function updateRule(
  ruleId: string,
  userId: string,
  updates: Partial<RuleRequest>
): Promise<HealingRule> {
  const supabase = createServerClient();

  // Calculate next execution time if schedule changed
  let nextExecutionAt: string | undefined;
  if (updates.autoExecute && updates.scheduleCron) {
    nextExecutionAt = calculateNextExecution(updates.scheduleCron);
  }

  const updateData: Record<string, unknown> = {};

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.triggerCondition !== undefined) updateData.trigger_condition = updates.triggerCondition;
  if (updates.conditions !== undefined) updateData.conditions = updates.conditions;
  if (updates.action !== undefined) updateData.action = updates.action;
  if (updates.actionParams !== undefined) updateData.action_params = updates.actionParams;
  if (updates.autoExecute !== undefined) updateData.auto_execute = updates.autoExecute;
  if (updates.scheduleCron !== undefined) updateData.schedule_cron = updates.scheduleCron;
  if (updates.maxChunksPerRun !== undefined) updateData.max_chunks_per_run = updates.maxChunksPerRun;
  if (nextExecutionAt !== undefined) updateData.next_execution_at = nextExecutionAt;

  const { data: rule, error } = await supabase
    .from('healing_rules')
    .update(updateData)
    .eq('id', ruleId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !rule) {
    throw new Error(`Failed to update rule: ${error?.message}`);
  }

  return mapRuleFromDb(rule);
}

/**
 * Delete a rule
 */
export async function deleteRule(ruleId: string, userId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('healing_rules')
    .delete()
    .eq('id', ruleId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete rule: ${error.message}`);
  }
}

/**
 * Toggle rule active status
 */
export async function toggleRule(
  ruleId: string,
  userId: string,
  isActive: boolean
): Promise<HealingRule> {
  const supabase = createServerClient();

  const { data: rule, error } = await supabase
    .from('healing_rules')
    .update({ is_active: isActive })
    .eq('id', ruleId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !rule) {
    throw new Error(`Failed to toggle rule: ${error?.message}`);
  }

  return mapRuleFromDb(rule);
}

/**
 * Get a specific rule
 */
export async function getRule(ruleId: string, userId: string): Promise<HealingRule | null> {
  const supabase = createServerClient();

  const { data: rule } = await supabase
    .from('healing_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('user_id', userId)
    .single();

  if (!rule) {
    return null;
  }

  return mapRuleFromDb(rule);
}

/**
 * List rules for a user/collection
 */
export async function listRules(
  userId: string,
  options?: {
    collectionId?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ rules: HealingRule[]; total: number }> {
  const supabase = createServerClient();

  let query = supabase
    .from('healing_rules')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.collectionId !== undefined) {
    query = query.eq('collection_id', options.collectionId);
  }

  if (options?.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 10) - 1);
  }

  const { data: rules, count } = await query;

  return {
    rules: (rules ?? []).map(mapRuleFromDb),
    total: count ?? 0,
  };
}

/**
 * Get active rules for a collection
 */
export async function getActiveRules(
  userId: string,
  collectionId?: string
): Promise<HealingRule[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('healing_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  // Get rules that apply to this collection or all collections
  if (collectionId) {
    query = query.or(`collection_id.eq.${collectionId},collection_id.is.null`);
  } else {
    query = query.is('collection_id', null);
  }

  const { data: rules } = await query;

  return (rules ?? []).map(mapRuleFromDb);
}

// ============================================
// Rule Evaluation
// ============================================

/**
 * Evaluate a rule against current health state
 */
export function evaluateRule(rule: HealingRule, health: IndexHealth): boolean {
  // Parse and evaluate the trigger condition
  if (rule.triggerCondition) {
    const conditionResult = evaluateCondition(rule.triggerCondition, health);
    if (!conditionResult) return false;
  }

  // Evaluate additional conditions if any
  if (rule.conditions && rule.conditions.length > 0) {
    const conditionResults = rule.conditions.map(c => evaluateSingleCondition(c, health));

    if (rule.triggerOperator === 'AND') {
      return conditionResults.every(r => r);
    } else {
      return conditionResults.some(r => r);
    }
  }

  return true;
}

/**
 * Evaluate a string condition against health data
 */
function evaluateCondition(condition: string, health: IndexHealth): boolean {
  try {
    // Parse condition like "health_score < 0.8" or "stale_chunks > 100"
    const match = condition.match(/^(\w+)\s*(>|>=|<|<=|=|!=)\s*(\d+\.?\d*)$/);

    if (!match) {
      console.warn(`Invalid condition format: ${condition}`);
      return false;
    }

    const [, field, operator, valueStr] = match;
    const value = parseFloat(valueStr);

    const fieldValue = getFieldValue(field, health);
    if (fieldValue === null) {
      console.warn(`Unknown field: ${field}`);
      return false;
    }

    return compareValues(fieldValue, operator, value);
  } catch {
    return false;
  }
}

/**
 * Evaluate a single condition object
 */
function evaluateSingleCondition(condition: RuleCondition, health: IndexHealth): boolean {
  const fieldValue = getFieldValue(condition.field, health);

  if (fieldValue === null) {
    return false;
  }

  const targetValue = condition.value;

  switch (condition.operator) {
    case 'eq':
      return fieldValue === targetValue;
    case 'ne':
      return fieldValue !== targetValue;
    case 'gt':
      return typeof fieldValue === 'number' && typeof targetValue === 'number' && fieldValue > targetValue;
    case 'gte':
      return typeof fieldValue === 'number' && typeof targetValue === 'number' && fieldValue >= targetValue;
    case 'lt':
      return typeof fieldValue === 'number' && typeof targetValue === 'number' && fieldValue < targetValue;
    case 'lte':
      return typeof fieldValue === 'number' && typeof targetValue === 'number' && fieldValue <= targetValue;
    case 'contains':
      return typeof fieldValue === 'string' && typeof targetValue === 'string' && fieldValue.includes(targetValue);
    case 'matches':
      return typeof fieldValue === 'string' && typeof targetValue === 'string' && new RegExp(targetValue).test(fieldValue);
    default:
      return false;
  }
}

/**
 * Get field value from health object
 */
function getFieldValue(field: string, health: IndexHealth): number | string | null {
  const fieldMap: Record<string, () => number | string> = {
    health_score: () => health.healthScore,
    freshness_score: () => health.freshnessScore,
    consistency_score: () => health.consistencyScore,
    coverage_score: () => health.coverageScore,
    total_chunks: () => health.totalChunks,
    healthy_chunks: () => health.healthyChunks,
    stale_chunks: () => health.staleChunks,
    orphaned_chunks: () => health.orphanedChunks,
    missing_embeddings: () => health.missingEmbeddings,
    corrupted_chunks: () => health.corruptedChunks,
    status: () => health.status,
  };

  const getter = fieldMap[field];
  return getter ? getter() : null;
}

/**
 * Compare values with operator
 */
function compareValues(fieldValue: number | string, operator: string, targetValue: number): boolean {
  if (typeof fieldValue !== 'number') return false;

  switch (operator) {
    case '>': return fieldValue > targetValue;
    case '>=': return fieldValue >= targetValue;
    case '<': return fieldValue < targetValue;
    case '<=': return fieldValue <= targetValue;
    case '=': return fieldValue === targetValue;
    case '!=': return fieldValue !== targetValue;
    default: return false;
  }
}

/**
 * Find rules that match an issue
 */
export function findMatchingRules(
  issue: IndexIssue,
  rules: HealingRule[]
): HealingRule[] {
  return rules.filter(rule => {
    if (!rule.isActive) return false;

    // Check if rule matches issue type
    const conditionMatches = evaluateIssueCondition(rule.triggerCondition, issue);

    return conditionMatches;
  });
}

/**
 * Evaluate condition against an issue
 */
function evaluateIssueCondition(condition: string, issue: IndexIssue): boolean {
  try {
    // Handle issue type conditions
    if (condition.startsWith('issue_type')) {
      const match = condition.match(/issue_type\s*=\s*['"]?(\w+)['"]?/);
      if (match) {
        return issue.type === match[1];
      }
    }

    // Handle severity conditions
    if (condition.startsWith('severity')) {
      const match = condition.match(/severity\s*=\s*['"]?(\w+)['"]?/);
      if (match) {
        return issue.severity === match[1];
      }
    }

    // Handle chunk count conditions
    if (condition.includes('chunk_count')) {
      const match = condition.match(/chunk_count\s*(>|>=|<|<=|=)\s*(\d+)/);
      if (match) {
        const [, operator, valueStr] = match;
        const value = parseInt(valueStr);
        return compareValues(issue.chunkIds.length, operator, value);
      }
    }

    return false;
  } catch {
    return false;
  }
}

// ============================================
// Scheduled Execution
// ============================================

/**
 * Get rules due for execution
 */
export async function getDueRules(): Promise<HealingRule[]> {
  const supabase = createServerClient();

  const now = new Date().toISOString();

  const { data: rules } = await supabase
    .from('healing_rules')
    .select('*')
    .eq('is_active', true)
    .eq('auto_execute', true)
    .lte('next_execution_at', now);

  return (rules ?? []).map(mapRuleFromDb);
}

/**
 * Update rule after execution
 */
export async function updateRuleAfterExecution(
  ruleId: string,
  success: boolean,
  error?: string
): Promise<void> {
  const supabase = createServerClient();

  // Get current rule for cron schedule
  const { data: rule } = await supabase
    .from('healing_rules')
    .select('schedule_cron')
    .eq('id', ruleId)
    .single();

  const nextExecutionAt = rule?.schedule_cron
    ? calculateNextExecution(rule.schedule_cron)
    : undefined;

  const updates: Record<string, unknown> = {
    last_executed_at: new Date().toISOString(),
    execution_count: supabase.rpc('increment_field', { value: 1 }),
    next_execution_at: nextExecutionAt,
  };

  if (!success && error) {
    updates.last_error = error;
  }

  await supabase
    .from('healing_rules')
    .update(updates)
    .eq('id', ruleId);
}

/**
 * Calculate next execution time from cron expression
 */
function calculateNextExecution(cron: string): string {
  // Simple cron parser for common patterns
  // Format: minute hour day month weekday

  try {
    const parts = cron.split(' ');
    if (parts.length !== 5) {
      throw new Error('Invalid cron format');
    }

    const [minute, hour, day, month, weekday] = parts;
    const now = new Date();
    const next = new Date(now);

    // Handle common patterns
    if (minute !== '*') {
      next.setMinutes(parseInt(minute));
    }
    if (hour !== '*') {
      next.setHours(parseInt(hour));
    }

    // If we're past this time today, move to next occurrence
    if (next <= now) {
      if (weekday !== '*') {
        // Weekly pattern
        const targetDay = parseInt(weekday);
        const currentDay = next.getDay();
        const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
        next.setDate(next.getDate() + daysUntil);
      } else if (day !== '*') {
        // Monthly pattern
        next.setMonth(next.getMonth() + 1);
        next.setDate(parseInt(day));
      } else {
        // Daily pattern
        next.setDate(next.getDate() + 1);
      }
    }

    return next.toISOString();
  } catch {
    // Default to 24 hours from now
    const next = new Date();
    next.setHours(next.getHours() + 24);
    return next.toISOString();
  }
}

// ============================================
// Default Rules
// ============================================

/**
 * Create default rules for a new user/collection
 */
export async function createDefaultRules(
  userId: string,
  collectionId?: string
): Promise<HealingRule[]> {
  const defaultRules: RuleRequest[] = [
    {
      name: 'Auto-heal stale embeddings',
      description: 'Automatically re-embed chunks when health score drops below threshold',
      collectionId,
      triggerCondition: 'stale_chunks > 50',
      action: 'reembed',
      autoExecute: true,
      scheduleCron: '0 3 * * 0', // Weekly at 3 AM Sunday
      maxChunksPerRun: 500,
    },
    {
      name: 'Remove orphaned chunks',
      description: 'Delete chunks that have lost their parent document',
      collectionId,
      triggerCondition: 'orphaned_chunks > 10',
      action: 'delete',
      autoExecute: false, // Requires approval
      maxChunksPerRun: 100,
    },
    {
      name: 'Critical health alert',
      description: 'Flag for review when health score is critical',
      collectionId,
      triggerCondition: 'health_score < 0.5',
      action: 'flag',
      autoExecute: true,
      maxChunksPerRun: 1000,
    },
    {
      name: 'Fix missing embeddings',
      description: 'Generate embeddings for chunks that are missing them',
      collectionId,
      triggerCondition: 'missing_embeddings > 0',
      action: 'reembed',
      autoExecute: true,
      scheduleCron: '0 4 * * *', // Daily at 4 AM
      maxChunksPerRun: 200,
    },
  ];

  const createdRules: HealingRule[] = [];

  for (const ruleRequest of defaultRules) {
    try {
      const rule = await createRule(userId, ruleRequest);
      createdRules.push(rule);
    } catch (error) {
      console.error('Failed to create default rule:', error);
    }
  }

  return createdRules;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Map database rule to typed HealingRule
 */
function mapRuleFromDb(rule: Record<string, unknown>): HealingRule {
  return {
    id: rule.id as string,
    userId: rule.user_id as string,
    orgId: rule.org_id as string | undefined,
    collectionId: rule.collection_id as string | undefined,
    name: rule.name as string,
    description: rule.description as string | undefined,
    triggerCondition: rule.trigger_condition as string,
    triggerOperator: (rule.trigger_operator as TriggerOperator) ?? 'AND',
    conditions: (rule.conditions as RuleCondition[]) ?? [],
    action: rule.action as HealingActionType,
    actionParams: rule.action_params as RuleActionParams | undefined,
    notifyEmail: (rule.notify_email as boolean) ?? false,
    notifyWebhook: (rule.notify_webhook as boolean) ?? false,
    webhookUrl: rule.webhook_url as string | undefined,
    autoExecute: (rule.auto_execute as boolean) ?? false,
    scheduleCron: rule.schedule_cron as string | undefined,
    lastExecutedAt: rule.last_executed_at as string | undefined,
    nextExecutionAt: rule.next_execution_at as string | undefined,
    maxChunksPerRun: (rule.max_chunks_per_run as number) ?? 1000,
    cooldownMinutes: (rule.cooldown_minutes as number) ?? 60,
    requireApproval: (rule.require_approval as boolean) ?? false,
    isActive: (rule.is_active as boolean) ?? true,
    executionCount: (rule.execution_count as number) ?? 0,
    lastError: rule.last_error as string | undefined,
    createdAt: rule.created_at as string,
    updatedAt: rule.updated_at as string,
  };
}

/**
 * Validate rule request
 */
export function validateRuleRequest(request: RuleRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!request.name || request.name.trim().length === 0) {
    errors.push('Rule name is required');
  }

  if (!request.triggerCondition || request.triggerCondition.trim().length === 0) {
    errors.push('Trigger condition is required');
  }

  if (!request.action) {
    errors.push('Action is required');
  }

  const validActions: HealingActionType[] = [
    'reembed', 'delete', 'flag', 'reindex', 'quarantine', 'restore', 'update_metadata'
  ];

  if (request.action && !validActions.includes(request.action)) {
    errors.push(`Invalid action: ${request.action}`);
  }

  if (request.scheduleCron) {
    const cronParts = request.scheduleCron.split(' ');
    if (cronParts.length !== 5) {
      errors.push('Invalid cron expression format');
    }
  }

  if (request.maxChunksPerRun !== undefined) {
    if (request.maxChunksPerRun < 1 || request.maxChunksPerRun > 10000) {
      errors.push('maxChunksPerRun must be between 1 and 10000');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
