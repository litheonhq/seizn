/**
 * Gap Filler - Execute Actions to Fill Knowledge Gaps
 *
 * Handles the execution of gap filling actions like URL ingestion,
 * file uploads, source connections, etc.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  KnowledgeGap,
  GapFillingAction,
  CreateGapParams,
  CreateActionParams,
  ActionParams,
  ActionResult,
  ActionStatus,
  GapStatus,
  UpdateGapParams,
  GapStatistics,
  GapOccurrence,
} from './types';

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Create a new knowledge gap record
 */
export async function createKnowledgeGap(
  params: CreateGapParams
): Promise<KnowledgeGap> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('knowledge_gaps')
    .insert({
      user_id: params.userId,
      collection_id: params.collectionId,
      query_text: params.queryText,
      query_embedding: params.queryEmbedding,
      gap_type: params.gapType,
      missing_entities: params.missingEntities || [],
      suggested_sources: params.suggestedSources || [],
      related_docs: params.relatedDocs || [],
      confidence: params.confidence || 0,
      analysis_metadata: params.analysisMetadata || {},
      status: 'open',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create knowledge gap: ${error.message}`);
  }

  return mapDbToGap(data);
}

/**
 * Find existing gap similar to query
 */
export async function findSimilarGap(
  userId: string,
  queryEmbedding: number[],
  threshold: number = 0.92
): Promise<KnowledgeGap | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('find_similar_gaps', {
    p_user_id: userId,
    p_query_embedding: queryEmbedding,
    p_threshold: threshold,
    p_limit: 1,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  // Fetch the full gap record
  const { data: gap, error: gapError } = await supabase
    .from('knowledge_gaps')
    .select()
    .eq('id', data[0].gap_id)
    .single();

  if (gapError || !gap) {
    return null;
  }

  return mapDbToGap(gap);
}

/**
 * Record a gap occurrence (for deduplication and frequency tracking)
 */
export async function recordGapOccurrence(
  gapId: string,
  queryText: string,
  queryEmbedding?: number[],
  traceId?: string,
  sessionId?: string
): Promise<GapOccurrence> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('gap_occurrences')
    .insert({
      gap_id: gapId,
      query_text: queryText,
      query_embedding: queryEmbedding,
      trace_id: traceId,
      session_id: sessionId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record gap occurrence: ${error.message}`);
  }

  return {
    id: data.id,
    gapId: data.gap_id,
    queryText: data.query_text,
    queryEmbedding: data.query_embedding,
    traceId: data.trace_id,
    sessionId: data.session_id,
    occurredAt: new Date(data.occurred_at),
  };
}

/**
 * Get a knowledge gap by ID
 */
export async function getKnowledgeGap(
  gapId: string,
  userId: string
): Promise<KnowledgeGap | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('knowledge_gaps')
    .select()
    .eq('id', gapId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDbToGap(data);
}

/**
 * List knowledge gaps with filters
 */
export async function listKnowledgeGaps(
  userId: string,
  options: {
    status?: GapStatus | GapStatus[];
    gapType?: string | string[];
    collectionId?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{ gaps: KnowledgeGap[]; total: number }> {
  const supabase = createServerClient();
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('knowledge_gaps')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Apply filters
  if (options.status) {
    if (Array.isArray(options.status)) {
      query = query.in('status', options.status);
    } else {
      query = query.eq('status', options.status);
    }
  }

  if (options.gapType) {
    if (Array.isArray(options.gapType)) {
      query = query.in('gap_type', options.gapType);
    } else {
      query = query.eq('gap_type', options.gapType);
    }
  }

  if (options.collectionId) {
    query = query.eq('collection_id', options.collectionId);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list knowledge gaps: ${error.message}`);
  }

  return {
    gaps: (data || []).map(mapDbToGap),
    total: count || 0,
  };
}

/**
 * Update a knowledge gap
 */
export async function updateKnowledgeGap(
  gapId: string,
  userId: string,
  params: UpdateGapParams
): Promise<KnowledgeGap> {
  const supabase = createServerClient();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.status !== undefined) {
    updates.status = params.status;
    if (params.status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = userId;
    }
  }

  if (params.resolutionAction !== undefined) {
    updates.resolution_action = params.resolutionAction;
  }

  if (params.resolutionNotes !== undefined) {
    updates.resolution_notes = params.resolutionNotes;
  }

  if (params.suggestedSources !== undefined) {
    updates.suggested_sources = params.suggestedSources;
  }

  const { data, error } = await supabase
    .from('knowledge_gaps')
    .update(updates)
    .eq('id', gapId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update knowledge gap: ${error.message}`);
  }

  return mapDbToGap(data);
}

/**
 * Get gap statistics for a user
 */
export async function getGapStatistics(userId: string): Promise<GapStatistics> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_gap_statistics', {
    p_user_id: userId,
  });

  if (error || !data || data.length === 0) {
    // Return empty stats if function fails or no data
    return {
      totalGaps: 0,
      openGaps: 0,
      resolvedGaps: 0,
      gapTypeCounts: {} as Record<string, number>,
      mostCommonEntities: [],
    };
  }

  const row = data[0];
  return {
    totalGaps: row.total_gaps || 0,
    openGaps: row.open_gaps || 0,
    resolvedGaps: row.resolved_gaps || 0,
    gapTypeCounts: row.gap_type_counts || {},
    avgResolutionTimeHours: row.avg_resolution_time_hours,
    mostCommonEntities: row.most_common_entities || [],
  };
}

// =============================================================================
// Gap Filling Actions
// =============================================================================

/**
 * Create a gap filling action
 */
export async function createGapFillingAction(
  params: CreateActionParams
): Promise<GapFillingAction> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('gap_filling_actions')
    .insert({
      gap_id: params.gapId,
      action_type: params.actionType,
      action_params: params.actionParams,
      status: 'pending',
      initiated_by: params.initiatedBy,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create gap filling action: ${error.message}`);
  }

  return mapDbToAction(data);
}

/**
 * Get actions for a gap
 */
export async function getGapActions(gapId: string): Promise<GapFillingAction[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('gap_filling_actions')
    .select()
    .eq('gap_id', gapId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get gap actions: ${error.message}`);
  }

  return (data || []).map(mapDbToAction);
}

/**
 * Update action status
 */
export async function updateActionStatus(
  actionId: string,
  status: ActionStatus,
  result?: ActionResult,
  error?: string
): Promise<GapFillingAction> {
  const supabase = createServerClient();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'running') {
    updates.started_at = new Date().toISOString();
  }

  if (status === 'completed' || status === 'failed') {
    updates.completed_at = new Date().toISOString();
  }

  if (result !== undefined) {
    updates.result = result;
  }

  if (error !== undefined) {
    updates.error = error;
  }

  const { data, error: dbError } = await supabase
    .from('gap_filling_actions')
    .update(updates)
    .eq('id', actionId)
    .select()
    .single();

  if (dbError) {
    throw new Error(`Failed to update action status: ${dbError.message}`);
  }

  return mapDbToAction(data);
}

// =============================================================================
// Action Execution
// =============================================================================

/**
 * Execute a gap filling action
 */
export async function executeAction(
  actionId: string,
  userId: string
): Promise<ActionResult> {
  // Get the action
  const supabase = createServerClient();
  const { data: actionData, error: fetchError } = await supabase
    .from('gap_filling_actions')
    .select()
    .eq('id', actionId)
    .single();

  if (fetchError || !actionData) {
    throw new Error('Action not found');
  }

  const action = mapDbToAction(actionData);

  // Update status to running
  await updateActionStatus(actionId, 'running');

  try {
    let result: ActionResult;

    switch (action.actionType) {
      case 'ingest_url':
        result = await executeIngestUrl(action.actionParams as { type: 'ingest_url'; url: string }, userId);
        break;

      case 'ingest_file':
        result = await executeIngestFile(action.actionParams as { type: 'ingest_file'; fileName: string }, userId);
        break;

      case 'connect_source':
        result = await executeConnectSource(action.actionParams as { type: 'connect_source'; name: string; sourceType: string; config: Record<string, unknown> }, userId);
        break;

      case 'request_access':
        result = await executeRequestAccess(action.actionParams as { type: 'request_access'; documentIds: string[]; requestReason: string }, userId);
        break;

      case 'ignore':
        result = { resolved: false, notes: (action.actionParams as { type: 'ignore'; reason: string }).reason };
        break;

      default:
        throw new Error(`Unknown action type: ${action.actionType}`);
    }

    // Update with success
    await updateActionStatus(actionId, 'completed', result);
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Update with failure
    await updateActionStatus(
      actionId,
      'failed',
      { resolved: false },
      errorMessage
    );

    throw err;
  }
}

/**
 * Execute URL ingestion action
 */
async function executeIngestUrl(
  params: { type: 'ingest_url'; url: string; crawlDepth?: number; metadata?: Record<string, unknown> },
  userId: string
): Promise<ActionResult> {
  // This would typically call the ingestion pipeline
  // For now, we'll return a placeholder that indicates the action needs manual processing

  // TODO: Integrate with summer indexing pipeline
  // const { indexDocuments } = await import('@/lib/summer');
  // const result = await indexDocuments({ userId, url: params.url, ... });

  return {
    resolved: false,
    notes: `URL ingestion queued for: ${params.url}. Manual processing may be required.`,
    documentsIndexed: 0,
  };
}

/**
 * Execute file ingestion action
 */
async function executeIngestFile(
  params: { type: 'ingest_file'; fileName: string; filePath?: string; fileUrl?: string },
  userId: string
): Promise<ActionResult> {
  // TODO: Integrate with file upload/ingestion pipeline
  return {
    resolved: false,
    notes: `File ingestion queued for: ${params.fileName}. Manual upload may be required.`,
    documentsIndexed: 0,
  };
}

/**
 * Execute source connection action
 */
async function executeConnectSource(
  params: { type: 'connect_source'; name: string; sourceType: string; config: Record<string, unknown> },
  userId: string
): Promise<ActionResult> {
  // TODO: Integrate with federated source management
  return {
    resolved: false,
    notes: `Source connection request created for: ${params.name}. Configuration required.`,
    sourceConnected: undefined,
  };
}

/**
 * Execute access request action
 */
async function executeRequestAccess(
  params: { type: 'request_access'; documentIds: string[]; requestReason: string },
  userId: string
): Promise<ActionResult> {
  // TODO: Integrate with permission management system
  return {
    resolved: false,
    notes: `Access request submitted for ${params.documentIds.length} document(s). Awaiting approval.`,
    accessGranted: false,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map database row to KnowledgeGap type
 */
function mapDbToGap(row: Record<string, unknown>): KnowledgeGap {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    collectionId: row.collection_id as string | undefined,
    queryText: row.query_text as string,
    queryEmbedding: row.query_embedding as number[] | undefined,
    gapType: row.gap_type as KnowledgeGap['gapType'],
    missingEntities: row.missing_entities as KnowledgeGap['missingEntities'],
    suggestedSources: row.suggested_sources as KnowledgeGap['suggestedSources'],
    relatedDocs: row.related_docs as KnowledgeGap['relatedDocs'],
    confidence: row.confidence as number,
    analysisVersion: row.analysis_version as string,
    analysisMetadata: row.analysis_metadata as Record<string, unknown>,
    status: row.status as GapStatus,
    resolutionAction: row.resolution_action as string | undefined,
    resolutionNotes: row.resolution_notes as string | undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
    resolvedBy: row.resolved_by as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Map database row to GapFillingAction type
 */
function mapDbToAction(row: Record<string, unknown>): GapFillingAction {
  return {
    id: row.id as string,
    gapId: row.gap_id as string,
    actionType: row.action_type as GapFillingAction['actionType'],
    actionParams: row.action_params as ActionParams,
    status: row.status as ActionStatus,
    startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    result: row.result as ActionResult | undefined,
    error: row.error as string | undefined,
    initiatedBy: row.initiated_by as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
