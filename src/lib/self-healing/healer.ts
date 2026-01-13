/**
 * Self-Healing Index Healer
 *
 * Executes healing actions to fix detected index issues.
 * Supports reembedding, deletion, reindexing, and metadata updates.
 */

import { createServerClient } from '@/lib/supabase';
import {
  IssueType,
  IssueSeverity,
  HealingActionType,
  ActionStatus,
  HealingOptions,
  HealingResult,
  HealingError,
  ActionResult,
  ReembedResult,
  ReembedError,
  IndexIssue,
  HealingRule,
  HealingAction,
  ActionDetails,
  FailedChunk,
} from './types';

// ============================================
// Constants
// ============================================

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_RATE_LIMIT = 100; // per minute
const DEFAULT_MAX_RETRIES = 3;
const EMBEDDING_MODEL = 'voyage-3';
const EMBEDDING_PROVIDER = 'voyage';

// ============================================
// Main Healing Functions
// ============================================

/**
 * Execute healing actions for detected issues
 */
export async function healIssues(
  collectionId: string,
  userId: string,
  issues: IndexIssue[],
  rules: HealingRule[],
  options?: HealingOptions
): Promise<HealingResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const dryRun = options?.dryRun ?? false;
  const stopOnError = options?.stopOnError ?? false;

  const result: HealingResult = {
    success: true,
    actionsExecuted: 0,
    chunksHealed: 0,
    chunksFailed: 0,
    errors: [],
    duration: 0,
    actions: [],
  };

  try {
    for (const issue of issues) {
      // Find applicable rule for this issue
      const applicableRule = findApplicableRule(issue, rules);
      const action = applicableRule?.action ?? getDefaultAction(issue.type);

      // Skip if action requires approval and not auto-applicable
      if (applicableRule?.requireApproval && !options?.dryRun) {
        continue;
      }

      // Execute action
      const actionResult = await executeAction(
        supabase,
        collectionId,
        userId,
        action,
        issue,
        {
          batchSize,
          dryRun,
          ruleId: applicableRule?.id,
        }
      );

      result.actions.push(actionResult);
      result.actionsExecuted++;
      result.chunksHealed += actionResult.successCount;
      result.chunksFailed += actionResult.failureCount;

      if (!actionResult.success) {
        result.success = false;
        if (actionResult.error) {
          result.errors.push({
            chunkId: issue.chunkIds[0],
            actionType: action,
            message: actionResult.error,
            retryable: true,
            timestamp: new Date().toISOString(),
          });
        }

        if (stopOnError) {
          break;
        }
      }
    }
  } catch (error) {
    result.success = false;
    result.errors.push({
      chunkId: '',
      actionType: 'flag',
      message: error instanceof Error ? error.message : 'Unknown error',
      retryable: false,
      timestamp: new Date().toISOString(),
    });
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Re-embed chunks with fresh embeddings
 */
export async function reembedChunks(
  collectionId: string,
  userId: string,
  chunkIds: string[],
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<ReembedResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  const result: ReembedResult = {
    success: true,
    reembeddedCount: 0,
    failedCount: 0,
    errors: [],
    tokensUsed: 0,
    duration: 0,
  };

  try {
    // Process in batches
    for (let i = 0; i < chunkIds.length; i += batchSize) {
      const batch = chunkIds.slice(i, i + batchSize);

      // Get chunk content
      const { data: chunks, error: fetchError } = await supabase
        .from('summer_chunks')
        .select('id, content')
        .in('id', batch);

      if (fetchError || !chunks) {
        result.errors.push({
          chunkId: batch[0],
          message: `Failed to fetch chunks: ${fetchError?.message}`,
        });
        result.failedCount += batch.length;
        continue;
      }

      // Generate embeddings for batch
      const contents = chunks.map(c => c.content);

      try {
        const embeddings = await generateEmbeddings(contents);
        result.tokensUsed += contents.reduce((sum, c) => sum + estimateTokens(c), 0);

        // Update each chunk with new embedding
        for (let j = 0; j < chunks.length; j++) {
          const { error: updateError } = await supabase
            .from('summer_chunks')
            .update({
              embedding: embeddings[j],
              updated_at: new Date().toISOString(),
            })
            .eq('id', chunks[j].id);

          if (updateError) {
            result.errors.push({
              chunkId: chunks[j].id,
              message: `Failed to update chunk: ${updateError.message}`,
            });
            result.failedCount++;
          } else {
            result.reembeddedCount++;
          }
        }
      } catch (embedError) {
        const errorMsg = embedError instanceof Error ? embedError.message : 'Embedding generation failed';
        for (const chunk of chunks) {
          result.errors.push({
            chunkId: chunk.id,
            message: errorMsg,
          });
        }
        result.failedCount += chunks.length;
      }

      // Rate limiting delay
      if (i + batchSize < chunkIds.length) {
        await sleep(100);
      }
    }
  } catch (error) {
    result.success = false;
    result.errors.push({
      chunkId: '',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  result.duration = Date.now() - startTime;
  result.success = result.failedCount === 0;

  return result;
}

/**
 * Delete orphaned or invalid chunks
 */
export async function deleteChunks(
  collectionId: string,
  userId: string,
  chunkIds: string[],
  options?: { createBackup?: boolean }
): Promise<ActionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  let successCount = 0;
  let failureCount = 0;
  let error: string | undefined;

  try {
    // Optionally create backup
    if (options?.createBackup) {
      const { data: chunks } = await supabase
        .from('summer_chunks')
        .select('*')
        .in('id', chunkIds);

      if (chunks) {
        // Store backup in healing_actions rollback_data
        // This would be handled by the caller
      }
    }

    // Delete in batches
    const batchSize = 100;
    for (let i = 0; i < chunkIds.length; i += batchSize) {
      const batch = chunkIds.slice(i, i + batchSize);

      const { error: deleteError, count } = await supabase
        .from('summer_chunks')
        .delete()
        .in('id', batch);

      if (deleteError) {
        failureCount += batch.length;
        error = deleteError.message;
      } else {
        successCount += count ?? batch.length;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    failureCount = chunkIds.length - successCount;
  }

  return {
    actionType: 'delete',
    chunkIds,
    success: failureCount === 0,
    successCount,
    failureCount,
    error,
    duration: Date.now() - startTime,
  };
}

/**
 * Quarantine problematic chunks
 */
export async function quarantineChunks(
  collectionId: string,
  userId: string,
  chunkIds: string[],
  reason: string
): Promise<ActionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  let successCount = 0;
  let failureCount = 0;
  let error: string | undefined;

  try {
    // Update chunks with quarantine metadata
    for (const chunkId of chunkIds) {
      const { error: updateError } = await supabase
        .from('summer_chunks')
        .update({
          metadata: supabase.rpc('jsonb_set_lax', {
            target: 'metadata',
            path: ['quarantine'],
            value: JSON.stringify({
              quarantined: true,
              quarantined_at: new Date().toISOString(),
              reason,
            }),
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', chunkId);

      if (updateError) {
        failureCount++;
        error = updateError.message;
      } else {
        successCount++;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    failureCount = chunkIds.length - successCount;
  }

  return {
    actionType: 'quarantine',
    chunkIds,
    success: failureCount === 0,
    successCount,
    failureCount,
    error,
    duration: Date.now() - startTime,
  };
}

/**
 * Update metadata for inconsistent chunks
 */
export async function updateChunkMetadata(
  collectionId: string,
  userId: string,
  chunkIds: string[],
  metadataUpdates: Record<string, unknown>
): Promise<ActionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  let successCount = 0;
  let failureCount = 0;
  let error: string | undefined;

  try {
    for (const chunkId of chunkIds) {
      // Get current metadata
      const { data: chunk } = await supabase
        .from('summer_chunks')
        .select('metadata')
        .eq('id', chunkId)
        .single();

      if (!chunk) {
        failureCount++;
        continue;
      }

      // Merge metadata
      const newMetadata = {
        ...(chunk.metadata ?? {}),
        ...metadataUpdates,
        _healing_updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('summer_chunks')
        .update({
          metadata: newMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', chunkId);

      if (updateError) {
        failureCount++;
        error = updateError.message;
      } else {
        successCount++;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    failureCount = chunkIds.length - successCount;
  }

  return {
    actionType: 'update_metadata',
    chunkIds,
    success: failureCount === 0,
    successCount,
    failureCount,
    error,
    duration: Date.now() - startTime,
  };
}

/**
 * Flag chunks for manual review
 */
export async function flagChunks(
  collectionId: string,
  userId: string,
  chunkIds: string[],
  issueType: IssueType,
  severity: IssueSeverity
): Promise<ActionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  let successCount = 0;
  let failureCount = 0;
  let error: string | undefined;

  try {
    // Add to issue queue
    const issues = chunkIds.map(chunkId => ({
      collection_id: collectionId,
      user_id: userId,
      chunk_id: chunkId,
      issue_type: issueType,
      issue_severity: severity,
      detector_type: 'scanner',
      status: 'pending',
    }));

    const { error: insertError } = await supabase
      .from('healing_issue_queue')
      .insert(issues);

    if (insertError) {
      failureCount = chunkIds.length;
      error = insertError.message;
    } else {
      successCount = chunkIds.length;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    failureCount = chunkIds.length;
  }

  return {
    actionType: 'flag',
    chunkIds,
    success: failureCount === 0,
    successCount,
    failureCount,
    error,
    duration: Date.now() - startTime,
  };
}

// ============================================
// Action Execution
// ============================================

/**
 * Execute a specific healing action
 */
async function executeAction(
  supabase: ReturnType<typeof createServerClient>,
  collectionId: string,
  userId: string,
  action: HealingActionType,
  issue: IndexIssue,
  options: { batchSize: number; dryRun: boolean; ruleId?: string }
): Promise<ActionResult> {
  const { batchSize, dryRun, ruleId } = options;

  // Record action start
  const actionRecord = await createActionRecord(
    supabase,
    collectionId,
    userId,
    action,
    issue,
    ruleId
  );

  if (dryRun) {
    return {
      actionType: action,
      chunkIds: issue.chunkIds,
      success: true,
      successCount: issue.chunkIds.length,
      failureCount: 0,
      duration: 0,
    };
  }

  let result: ActionResult;

  switch (action) {
    case 'reembed':
      const reembedResult = await reembedChunks(
        collectionId,
        userId,
        issue.chunkIds,
        batchSize
      );
      result = {
        actionType: 'reembed',
        chunkIds: issue.chunkIds,
        success: reembedResult.success,
        successCount: reembedResult.reembeddedCount,
        failureCount: reembedResult.failedCount,
        error: reembedResult.errors.length > 0 ? reembedResult.errors[0].message : undefined,
        duration: reembedResult.duration,
      };
      break;

    case 'delete':
      result = await deleteChunks(collectionId, userId, issue.chunkIds, { createBackup: true });
      break;

    case 'quarantine':
      result = await quarantineChunks(collectionId, userId, issue.chunkIds, issue.details);
      break;

    case 'update_metadata':
      result = await updateChunkMetadata(collectionId, userId, issue.chunkIds, {});
      break;

    case 'flag':
      result = await flagChunks(collectionId, userId, issue.chunkIds, issue.type, issue.severity);
      break;

    case 'reindex':
      // Reindex is essentially reembed + metadata refresh
      result = await reembedChunks(collectionId, userId, issue.chunkIds, batchSize)
        .then(r => ({
          actionType: 'reindex' as const,
          chunkIds: issue.chunkIds,
          success: r.success,
          successCount: r.reembeddedCount,
          failureCount: r.failedCount,
          error: r.errors[0]?.message,
          duration: r.duration,
        }));
      break;

    case 'restore':
      // Restore requires backup data - flag for manual handling
      result = await flagChunks(collectionId, userId, issue.chunkIds, issue.type, 'high');
      result.actionType = 'restore';
      break;

    default:
      result = {
        actionType: action,
        chunkIds: issue.chunkIds,
        success: false,
        successCount: 0,
        failureCount: issue.chunkIds.length,
        error: `Unsupported action type: ${action}`,
        duration: 0,
      };
  }

  // Update action record with result
  if (actionRecord) {
    await updateActionRecord(supabase, actionRecord.id, result);
  }

  return result;
}

// ============================================
// Action Recording
// ============================================

/**
 * Create an action record in the database
 */
async function createActionRecord(
  supabase: ReturnType<typeof createServerClient>,
  collectionId: string,
  userId: string,
  action: HealingActionType,
  issue: IndexIssue,
  ruleId?: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('healing_actions')
    .insert({
      collection_id: collectionId,
      user_id: userId,
      action_type: action,
      chunk_ids: issue.chunkIds,
      chunk_count: issue.chunkIds.length,
      issue_type: issue.type,
      issue_severity: issue.severity,
      status: 'running',
      rule_id: ruleId,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create action record:', error);
    return null;
  }

  return data;
}

/**
 * Update action record with results
 */
async function updateActionRecord(
  supabase: ReturnType<typeof createServerClient>,
  actionId: string,
  result: ActionResult
): Promise<void> {
  const { error } = await supabase
    .from('healing_actions')
    .update({
      status: result.success ? 'success' : (result.successCount > 0 ? 'partial' : 'failed'),
      success_count: result.successCount,
      failure_count: result.failureCount,
      error_message: result.error,
      completed_at: new Date().toISOString(),
      duration_ms: result.duration,
    })
    .eq('id', actionId);

  if (error) {
    console.error('Failed to update action record:', error);
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Find applicable rule for an issue
 */
function findApplicableRule(issue: IndexIssue, rules: HealingRule[]): HealingRule | null {
  for (const rule of rules) {
    if (!rule.isActive) continue;

    // Check if rule matches issue type
    const conditionMatches = evaluateRuleCondition(rule.triggerCondition, issue);

    if (conditionMatches) {
      return rule;
    }
  }

  return null;
}

/**
 * Evaluate a rule condition against an issue
 */
function evaluateRuleCondition(condition: string, issue: IndexIssue): boolean {
  try {
    // Simple condition parsing
    const parts = condition.split(/\s+/);
    if (parts.length !== 3) return false;

    const [field, operator, value] = parts;

    switch (field) {
      case 'issue_type':
        return operator === '=' && value === issue.type;
      case 'severity':
        return operator === '=' && value === issue.severity;
      case 'chunk_count':
        const numValue = parseInt(value);
        switch (operator) {
          case '>': return issue.chunkIds.length > numValue;
          case '>=': return issue.chunkIds.length >= numValue;
          case '<': return issue.chunkIds.length < numValue;
          case '<=': return issue.chunkIds.length <= numValue;
          case '=': return issue.chunkIds.length === numValue;
          default: return false;
        }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Get default action for an issue type
 */
function getDefaultAction(issueType: IssueType): HealingActionType {
  switch (issueType) {
    case 'stale':
      return 'reembed';
    case 'orphaned':
      return 'delete';
    case 'missing_embedding':
      return 'reembed';
    case 'corrupted':
      return 'reindex';
    case 'inconsistent':
      return 'update_metadata';
    case 'low_quality':
      return 'flag';
    default:
      return 'flag';
  }
}

/**
 * Generate embeddings for content
 * This is a placeholder - actual implementation depends on embedding provider
 */
async function generateEmbeddings(contents: string[]): Promise<number[][]> {
  // In production, this would call the Voyage AI API or other embedding provider
  // For now, return placeholder embeddings

  const voyageApiKey = process.env.VOYAGE_API_KEY;

  if (!voyageApiKey) {
    throw new Error('VOYAGE_API_KEY not configured');
  }

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${voyageApiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: contents,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

/**
 * Estimate token count for content
 */
function estimateTokens(content: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(content.length / 4);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Issue Queue Management
// ============================================

/**
 * Mark issues as resolved in the queue
 */
export async function resolveQueuedIssues(
  userId: string,
  chunkIds: string[],
  method: 'auto' | 'manual' | 'rule',
  jobId?: string
): Promise<number> {
  const supabase = createServerClient();

  const { error, count } = await supabase
    .from('healing_issue_queue')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: method,
      resolution_job_id: jobId,
    })
    .eq('user_id', userId)
    .in('chunk_id', chunkIds)
    .eq('status', 'pending');

  if (error) {
    console.error('Failed to resolve issues:', error);
    return 0;
  }

  return count ?? 0;
}

/**
 * Get pending issues from the queue
 */
export async function getPendingIssues(
  collectionId: string,
  userId: string,
  options?: { limit?: number; issueType?: IssueType; severity?: IssueSeverity }
): Promise<{ chunkId: string; issueType: IssueType; severity: IssueSeverity }[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('healing_issue_queue')
    .select('chunk_id, issue_type, issue_severity')
    .eq('collection_id', collectionId)
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (options?.issueType) {
    query = query.eq('issue_type', options.issueType);
  }

  if (options?.severity) {
    query = query.eq('issue_severity', options.severity);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map(item => ({
    chunkId: item.chunk_id,
    issueType: item.issue_type as IssueType,
    severity: item.issue_severity as IssueSeverity,
  }));
}
