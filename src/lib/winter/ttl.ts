/**
 * Seizn Winter - TTL Enforcement
 *
 * Handles automatic cleanup of expired data:
 * - Memories past their TTL
 * - Traces past retention period
 * - Documents marked for deletion
 *
 * Can be triggered manually via API or scheduled via cron
 */

import { createServerClient } from '@/lib/supabase';
import { resolvePolicyConfig, getActivePolicy } from './policy';

// ============================================
// Types
// ============================================

export interface CleanupOptions {
  /** If provided, only clean up for this user */
  userId?: string;
  /** Override policy TTL (in days) */
  ttlDays?: number;
  /** Trace retention period (in days) */
  traceRetentionDays?: number;
  /** Run in dry-run mode (returns what would be deleted without deleting) */
  dryRun?: boolean;
  /** Maximum number of records to delete in a single run */
  batchSize?: number;
}

export interface CleanupResult {
  success: boolean;
  dryRun: boolean;
  deletedMemories: number;
  deletedTraces: number;
  deletedDocuments: number;
  deletedChunks: number;
  errors: string[];
  executionTimeMs: number;
}

export interface ExpiredRecord {
  id: string;
  type: 'memory' | 'trace' | 'document' | 'chunk';
  createdAt: string;
  ttlDays: number;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_TTL_DAYS = 30;
const DEFAULT_TRACE_RETENTION_DAYS = 14;
const DEFAULT_BATCH_SIZE = 1000;

// ============================================
// Core Cleanup Functions
// ============================================

/**
 * Run full TTL cleanup job
 */
export async function runTtlCleanup(
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  const {
    userId,
    ttlDays = DEFAULT_TTL_DAYS,
    traceRetentionDays = DEFAULT_TRACE_RETENTION_DAYS,
    dryRun = false,
    batchSize = DEFAULT_BATCH_SIZE,
  } = options;

  let deletedMemories = 0;
  let deletedTraces = 0;
  let deletedDocuments = 0;
  let deletedChunks = 0;

  try {
    // 1. Clean up expired memories
    const memoryResult = await cleanupExpiredMemories({
      userId,
      ttlDays,
      dryRun,
      batchSize,
    });
    deletedMemories = memoryResult.deleted;
    if (memoryResult.error) errors.push(`Memories: ${memoryResult.error}`);

    // 2. Clean up expired traces
    const traceResult = await cleanupExpiredTraces({
      userId,
      retentionDays: traceRetentionDays,
      dryRun,
      batchSize,
    });
    deletedTraces = traceResult.deleted;
    if (traceResult.error) errors.push(`Traces: ${traceResult.error}`);

    // 3. Clean up soft-deleted documents (Summer)
    const docResult = await cleanupDeletedDocuments({
      userId,
      dryRun,
      batchSize,
    });
    deletedDocuments = docResult.deletedDocs;
    deletedChunks = docResult.deletedChunks;
    if (docResult.error) errors.push(`Documents: ${docResult.error}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    errors.push(message);
  }

  return {
    success: errors.length === 0,
    dryRun,
    deletedMemories,
    deletedTraces,
    deletedDocuments,
    deletedChunks,
    errors,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Clean up expired memories based on TTL policy
 */
async function cleanupExpiredMemories(params: {
  userId?: string;
  ttlDays: number;
  dryRun: boolean;
  batchSize: number;
}): Promise<{ deleted: number; error?: string }> {
  const supabase = createServerClient();

  try {
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - params.ttlDays);

    // Build query
    let query = supabase
      .from('memories')
      .select('id', { count: 'exact' })
      .lt('created_at', cutoffDate.toISOString())
      .eq('is_deleted', false);

    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }

    // Get count first
    const { count: expiredCount, error: countError } = await query.limit(1);

    if (countError) {
      return { deleted: 0, error: countError.message };
    }

    if (params.dryRun) {
      return { deleted: expiredCount || 0 };
    }

    // Soft delete expired memories (in batches)
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore && totalDeleted < params.batchSize) {
      let deleteQuery = supabase
        .from('memories')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .lt('created_at', cutoffDate.toISOString())
        .eq('is_deleted', false)
        .select('id')
        .limit(Math.min(100, params.batchSize - totalDeleted));

      if (params.userId) {
        deleteQuery = deleteQuery.eq('user_id', params.userId);
      }

      const { data, error } = await deleteQuery;

      if (error) {
        return { deleted: totalDeleted, error: error.message };
      }

      const batchSize = data?.length || 0;
      totalDeleted += batchSize;
      hasMore = batchSize === 100;
    }

    return { deleted: totalDeleted };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { deleted: 0, error: message };
  }
}

/**
 * Clean up expired retrieval traces
 */
async function cleanupExpiredTraces(params: {
  userId?: string;
  retentionDays: number;
  dryRun: boolean;
  batchSize: number;
}): Promise<{ deleted: number; error?: string }> {
  const supabase = createServerClient();

  try {
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - params.retentionDays);

    // Build query
    let query = supabase
      .from('fall_retrieval_traces')
      .select('id', { count: 'exact' })
      .lt('created_at', cutoffDate.toISOString());

    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }

    // Get count first
    const { count: expiredCount, error: countError } = await query.limit(1);

    if (countError) {
      return { deleted: 0, error: countError.message };
    }

    if (params.dryRun) {
      return { deleted: expiredCount || 0 };
    }

    // Delete expired traces (in batches)
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore && totalDeleted < params.batchSize) {
      // First, get IDs to delete
      let selectQuery = supabase
        .from('fall_retrieval_traces')
        .select('id')
        .lt('created_at', cutoffDate.toISOString())
        .limit(Math.min(100, params.batchSize - totalDeleted));

      if (params.userId) {
        selectQuery = selectQuery.eq('user_id', params.userId);
      }

      const { data: idsToDelete, error: selectError } = await selectQuery;

      if (selectError) {
        return { deleted: totalDeleted, error: selectError.message };
      }

      if (!idsToDelete || idsToDelete.length === 0) {
        hasMore = false;
        break;
      }

      // Delete by IDs
      const ids = idsToDelete.map((row) => row.id);
      const { error: deleteError } = await supabase
        .from('fall_retrieval_traces')
        .delete()
        .in('id', ids);

      if (deleteError) {
        return { deleted: totalDeleted, error: deleteError.message };
      }

      totalDeleted += ids.length;
      hasMore = idsToDelete.length === 100;
    }

    return { deleted: totalDeleted };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { deleted: 0, error: message };
  }
}

/**
 * Clean up soft-deleted documents and their chunks
 */
async function cleanupDeletedDocuments(params: {
  userId?: string;
  dryRun: boolean;
  batchSize: number;
}): Promise<{ deletedDocs: number; deletedChunks: number; error?: string }> {
  const supabase = createServerClient();

  try {
    // First, find soft-deleted documents (older than 7 days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    let query = supabase
      .from('summer_documents')
      .select('id', { count: 'exact' })
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoffDate.toISOString());

    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }

    const { data: docsToDelete, count, error: selectError } = await query.limit(
      params.batchSize
    );

    if (selectError) {
      // Table might not have deleted_at column - silently skip
      if (selectError.message.includes('deleted_at')) {
        return { deletedDocs: 0, deletedChunks: 0 };
      }
      return { deletedDocs: 0, deletedChunks: 0, error: selectError.message };
    }

    if (params.dryRun) {
      return { deletedDocs: count || 0, deletedChunks: 0 };
    }

    if (!docsToDelete || docsToDelete.length === 0) {
      return { deletedDocs: 0, deletedChunks: 0 };
    }

    const docIds = docsToDelete.map((doc) => doc.id);

    // Delete chunks first (due to foreign key)
    const { data: deletedChunks, error: chunkError } = await supabase
      .from('summer_chunks')
      .delete()
      .in('document_id', docIds)
      .select('id');

    if (chunkError) {
      return {
        deletedDocs: 0,
        deletedChunks: 0,
        error: `Chunks: ${chunkError.message}`,
      };
    }

    // Delete documents
    const { error: docError } = await supabase
      .from('summer_documents')
      .delete()
      .in('id', docIds);

    if (docError) {
      return {
        deletedDocs: 0,
        deletedChunks: deletedChunks?.length || 0,
        error: `Docs: ${docError.message}`,
      };
    }

    return {
      deletedDocs: docIds.length,
      deletedChunks: deletedChunks?.length || 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { deletedDocs: 0, deletedChunks: 0, error: message };
  }
}

// ============================================
// User-Specific TTL Resolution
// ============================================

/**
 * Get effective TTL for a user based on their policy
 */
export async function getUserTtl(userId: string): Promise<number> {
  try {
    const policy = await getActivePolicy(userId, 'memory', 'user');
    const config = resolvePolicyConfig(policy);
    return config.ttlDays ?? DEFAULT_TTL_DAYS;
  } catch {
    return DEFAULT_TTL_DAYS;
  }
}

// ============================================
// Preview Functions
// ============================================

/**
 * Preview what would be deleted without actually deleting
 */
export async function previewCleanup(
  options: CleanupOptions = {}
): Promise<{
  memories: ExpiredRecord[];
  traces: ExpiredRecord[];
  documents: ExpiredRecord[];
}> {
  const supabase = createServerClient();

  const {
    userId,
    ttlDays = DEFAULT_TTL_DAYS,
    traceRetentionDays = DEFAULT_TRACE_RETENTION_DAYS,
  } = options;

  const memoryCutoff = new Date();
  memoryCutoff.setDate(memoryCutoff.getDate() - ttlDays);

  const traceCutoff = new Date();
  traceCutoff.setDate(traceCutoff.getDate() - traceRetentionDays);

  // Get expired memories preview
  let memoryQuery = supabase
    .from('memories')
    .select('id, created_at')
    .lt('created_at', memoryCutoff.toISOString())
    .eq('is_deleted', false)
    .limit(100);

  if (userId) {
    memoryQuery = memoryQuery.eq('user_id', userId);
  }

  const { data: expiredMemories } = await memoryQuery;

  // Get expired traces preview
  let traceQuery = supabase
    .from('fall_retrieval_traces')
    .select('id, created_at')
    .lt('created_at', traceCutoff.toISOString())
    .limit(100);

  if (userId) {
    traceQuery = traceQuery.eq('user_id', userId);
  }

  const { data: expiredTraces } = await traceQuery;

  // Get soft-deleted documents preview
  const docCutoff = new Date();
  docCutoff.setDate(docCutoff.getDate() - 7);

  let docQuery = supabase
    .from('summer_documents')
    .select('id, created_at')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', docCutoff.toISOString())
    .limit(100);

  if (userId) {
    docQuery = docQuery.eq('user_id', userId);
  }

  const { data: deletedDocs } = await docQuery;

  return {
    memories: (expiredMemories || []).map((m) => ({
      id: m.id,
      type: 'memory' as const,
      createdAt: m.created_at,
      ttlDays,
    })),
    traces: (expiredTraces || []).map((t) => ({
      id: t.id,
      type: 'trace' as const,
      createdAt: t.created_at,
      ttlDays: traceRetentionDays,
    })),
    documents: (deletedDocs || []).map((d) => ({
      id: d.id,
      type: 'document' as const,
      createdAt: d.created_at,
      ttlDays: 7,
    })),
  };
}

// ============================================
// Scheduled Job Entry Point
// ============================================

/**
 * Entry point for cron/scheduled cleanup jobs
 * Runs cleanup for all users with default settings
 */
export async function scheduledCleanup(): Promise<CleanupResult> {
  console.log('[TTL Cleanup] Starting scheduled cleanup job...');

  const result = await runTtlCleanup({
    dryRun: false,
    batchSize: 5000, // Higher batch size for scheduled jobs
  });

  console.log(
    `[TTL Cleanup] Completed in ${result.executionTimeMs}ms:`,
    `memories=${result.deletedMemories}`,
    `traces=${result.deletedTraces}`,
    `documents=${result.deletedDocuments}`,
    `chunks=${result.deletedChunks}`,
    result.errors.length > 0 ? `errors=${result.errors.join(', ')}` : ''
  );

  return result;
}
