/**
 * Gap Filler - Execute Actions to Fill Knowledge Gaps
 *
 * Handles the execution of gap filling actions like URL ingestion,
 * file uploads, source connections, etc.
 */

import { createServerClient } from '@/lib/supabase';
import { createHash } from 'crypto';
import { PDFParse } from 'pdf-parse';
import { validateOutboundUrl } from '@/lib/security/outbound-url';
import { indexDocuments } from '@/lib/summer/indexer';
import { encrypt } from '@/lib/winter/crypto';
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

interface ActionExecutionContext {
  gapId: string;
  collectionId?: string;
  queryText?: string;
}

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
  // Get the action with gap ownership context
  const supabase = createServerClient();
  const { data: actionData, error: fetchError } = await supabase
    .from('gap_filling_actions')
    .select(`
      *,
      gap:knowledge_gaps!inner(
        id,
        user_id,
        collection_id,
        query_text
      )
    `)
    .eq('id', actionId)
    .single();

  if (fetchError || !actionData) {
    throw new Error('Action not found');
  }

  const gap = normalizeGapContext(actionData.gap);
  if (!gap || gap.user_id !== userId) {
    throw new Error('Action not found');
  }

  const context: ActionExecutionContext = {
    gapId: gap.id,
    collectionId: gap.collection_id ?? undefined,
    queryText: gap.query_text ?? undefined,
  };

  const action = mapDbToAction(actionData);

  // Update status to running
  await updateActionStatus(actionId, 'running');

  try {
    let result: ActionResult;

    switch (action.actionType) {
      case 'ingest_url':
        result = await executeIngestUrl(
          action.actionParams as { type: 'ingest_url'; url: string },
          userId,
          context
        );
        break;

      case 'ingest_file':
        result = await executeIngestFile(
          action.actionParams as { type: 'ingest_file'; fileName: string },
          userId,
          context
        );
        break;

      case 'connect_source':
        result = await executeConnectSource(
          action.actionParams as {
            type: 'connect_source';
            name: string;
            sourceType: string;
            config: Record<string, unknown>;
          },
          userId,
          context
        );
        break;

      case 'request_access':
        result = await executeRequestAccess(
          action.actionParams as { type: 'request_access'; documentIds: string[]; requestReason: string },
          userId,
          context
        );
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
  userId: string,
  context: ActionExecutionContext
): Promise<ActionResult> {
  const normalizedUrl = await normalizeOutboundUrl(params.url);
  const collectionId = await resolveTargetCollectionId(userId, context.collectionId);
  const fetched = await fetchRemoteContent(normalizedUrl, URL_FETCH_TIMEOUT_MS);
  const title = fetched.title ?? deriveTitleFromUrl(normalizedUrl);

  const result = await indexDocuments({
    userId,
    collectionId,
    documents: [
      {
        id: `gap-url:${hashStable(normalizedUrl)}`,
        title,
        content: fetched.text,
        source: normalizedUrl,
        metadata: {
          source_type: 'gap_filler_url',
          gap_id: context.gapId,
          query_text: context.queryText,
          content_type: fetched.contentType,
          crawl_depth: params.crawlDepth ?? 0,
          fetched_at: new Date().toISOString(),
          ...(params.metadata ?? {}),
        },
      },
    ],
    options: {
      chunking_strategy: 'semantic',
      skip_duplicates: true,
    },
  });

  const successfulDocuments = countSuccessfulDocuments(result);

  return {
    resolved: successfulDocuments > 0,
    notes: `Indexed ${successfulDocuments} document(s) from ${normalizedUrl}`,
    documentsIndexed: successfulDocuments,
    chunksCreated: result.chunks_created,
  };
}

/**
 * Execute file ingestion action
 */
async function executeIngestFile(
  params: {
    type: 'ingest_file';
    fileName?: string;
    file_name?: string;
    filePath?: string;
    file_path?: string;
    fileUrl?: string;
    file_url?: string;
    mimeType?: string;
    mime_type?: string;
  },
  userId: string,
  context: ActionExecutionContext
): Promise<ActionResult> {
  const fileName = getStringParam(params, ['fileName', 'file_name']) ?? 'uploaded-file';
  const filePath = getStringParam(params, ['filePath', 'file_path']);
  const fileUrl = getStringParam(params, ['fileUrl', 'file_url']);
  const mimeType = getStringParam(params, ['mimeType', 'mime_type']);

  if (filePath && !fileUrl) {
    return {
      resolved: false,
      documentsIndexed: 0,
      notes: `Local file path ingestion is restricted for security. Upload ${fileName} through the file upload API or provide fileUrl.`,
    };
  }

  if (!fileUrl) {
    return {
      resolved: false,
      documentsIndexed: 0,
      notes: `No fileUrl provided for ${fileName}. Please upload the file first.`,
    };
  }

  const normalizedUrl = await normalizeOutboundUrl(fileUrl);
  const collectionId = await resolveTargetCollectionId(userId, context.collectionId);
  const fetched = await fetchRemoteContent(normalizedUrl, FILE_FETCH_TIMEOUT_MS, mimeType);

  const result = await indexDocuments({
    userId,
    collectionId,
    documents: [
      {
        id: `gap-file:${hashStable(`${normalizedUrl}:${fileName}`)}`,
        title: fileName,
        content: fetched.text,
        source: normalizedUrl,
        mime_type: mimeType ?? fetched.contentType,
        metadata: {
          source_type: 'gap_filler_file',
          gap_id: context.gapId,
          query_text: context.queryText,
          file_name: fileName,
          file_url: normalizedUrl,
          content_type: fetched.contentType,
          fetched_at: new Date().toISOString(),
        },
      },
    ],
    options: {
      chunking_strategy: 'sentence',
      skip_duplicates: true,
    },
  });

  const successfulDocuments = countSuccessfulDocuments(result);
  return {
    resolved: successfulDocuments > 0,
    notes: `Indexed ${successfulDocuments} file document(s) from ${fileName}`,
    documentsIndexed: successfulDocuments,
    chunksCreated: result.chunks_created,
  };
}

/**
 * Execute source connection action
 */
async function executeConnectSource(
  params: {
    type: 'connect_source';
    name: string;
    sourceType?: string;
    source_type?: string;
    config: Record<string, unknown>;
  },
  userId: string,
  context: ActionExecutionContext
): Promise<ActionResult> {
  const sourceType = (params.sourceType ?? params.source_type ?? 'http').toLowerCase();
  const config = params.config ?? {};
  const provider = resolveFederatedProvider(sourceType, config);
  const encryptedConfig = encrypt(JSON.stringify(config));
  const capabilities = resolveSourceCapabilities(sourceType, config);
  const requestedOrganizationId = getStringParam(config, ['organization_id', 'organizationId']);
  const organizationId = await resolvePermittedOrganizationId(userId, requestedOrganizationId);

  const supabase = createServerClient();
  const { data: source, error: sourceError } = await supabase
    .from('summer_federated_sources')
    .insert({
      user_id: userId,
      name: params.name,
      provider,
      config_encrypted: encryptedConfig,
      capabilities,
      is_active: true,
      organization_id: organizationId ?? null,
      created_by: userId,
      verification_status: 'pending',
    })
    .select('id, name, provider')
    .single();

  if (sourceError || !source) {
    throw new Error(`Failed to connect source: ${sourceError?.message ?? 'Unknown error'}`);
  }

  try {
    await supabase
      .from('summer_federated_source_access')
      .upsert(
        {
          source_id: source.id,
          user_id: userId,
          role: 'owner',
          granted_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source_id,user_id' }
      );
  } catch (error) {
    console.warn('Failed to upsert owner grant for connected source:', error);
  }

  try {
    await supabase
      .from('summer_federated_operations')
      .insert({
        user_id: userId,
        organization_id: organizationId ?? null,
        operation: 'source.create',
        resource_type: 'source',
        resource_id: source.id,
        details: {
          source_type: sourceType,
          gap_id: context.gapId,
        },
        status: 'success',
      });
  } catch (error) {
    console.warn('Failed to log federated source create operation:', error);
  }

  return {
    resolved: true,
    notes: `Connected federated source "${source.name}" (${source.provider})`,
    sourceConnected: source.id,
  };
}

/**
 * Execute access request action
 */
async function executeRequestAccess(
  params: {
    type: 'request_access';
    documentIds?: string[];
    document_ids?: string[];
    requestReason?: string;
    request_reason?: string;
    requestedPermission?: 'read' | 'full';
    requested_permission?: 'read' | 'full';
  },
  userId: string,
  context: ActionExecutionContext
): Promise<ActionResult> {
  const documentIds = normalizeStringArray(params.documentIds ?? params.document_ids ?? []);
  if (documentIds.length === 0) {
    throw new Error('No document IDs provided for access request');
  }

  const requestReason =
    getStringParam(params, ['requestReason', 'request_reason']) ??
    'Requested via knowledge gap filler';
  const requestedPermission =
    (params.requestedPermission ?? params.requested_permission ?? 'read') === 'full'
      ? 'full'
      : 'read';

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const operationRows = documentIds.map((documentId) => ({
    user_id: userId,
    organization_id: null,
    operation: 'access.update',
    resource_type: 'access',
    resource_id: null,
    details: {
      request_type: 'knowledge_gap_access',
      target_document_id: documentId,
      request_reason: requestReason,
      requested_permission: requestedPermission,
      gap_id: context.gapId,
      requested_at: now,
      status: 'pending_review',
    },
    status: 'success',
  }));

  const { error } = await supabase
    .from('summer_federated_operations')
    .insert(operationRows);

  if (error) {
    console.warn('Failed to persist access request operation log:', error);
    return {
      resolved: false,
      accessGranted: false,
      notes: `Access request for ${documentIds.length} document(s) could not be persisted automatically (${error.message}).`,
    };
  }

  return {
    resolved: false,
    notes: `Access request logged for ${documentIds.length} document(s). Awaiting approval.`,
    accessGranted: false,
  };
}

const URL_FETCH_TIMEOUT_MS = 15_000;
const FILE_FETCH_TIMEOUT_MS = 20_000;
const MAX_REMOTE_CONTENT_BYTES = 3 * 1024 * 1024; // 3MB
const MAX_INDEXABLE_TEXT_CHARS = 200_000;
const MAX_FETCH_REDIRECTS = 5;

const VALID_FEDERATED_PROVIDERS = new Set([
  'supabase',
  'pinecone',
  'weaviate',
  'azure_ai_search',
  'vespa',
  'custom',
]);

interface NormalizedGapContext {
  id: string;
  user_id: string;
  collection_id: string | null;
  query_text: string | null;
}

interface RemoteContent {
  text: string;
  contentType: string;
  title?: string;
}

function normalizeGapContext(raw: unknown): NormalizedGapContext | null {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const row = candidate as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : undefined;
  const userId = typeof row.user_id === 'string' ? row.user_id : undefined;

  if (!id || !userId) {
    return null;
  }

  return {
    id,
    user_id: userId,
    collection_id: typeof row.collection_id === 'string' ? row.collection_id : null,
    query_text: typeof row.query_text === 'string' ? row.query_text : null,
  };
}

function getStringParam(source: unknown, keys: string[]): string | undefined {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  const row = source as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeStringArray(values: unknown[]): string[] {
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

function hashStable(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function deriveTitleFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const pathParts = url.pathname
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);

    const lastPath = pathParts[pathParts.length - 1];
    if (lastPath) {
      return decodeURIComponent(lastPath).slice(0, 200);
    }

    return url.hostname;
  } catch {
    return rawUrl.slice(0, 200);
  }
}

async function normalizeOutboundUrl(rawUrl: string): Promise<string> {
  const validation = await validateOutboundUrl(rawUrl, {
    allowHttp: process.env.NODE_ENV !== 'production',
    allowPrivateNetwork: false,
  });

  if (!validation.valid || !validation.normalizedUrl) {
    throw new Error(`URL validation failed: ${validation.reason ?? 'invalid URL'}`);
  }

  return validation.normalizedUrl;
}

async function resolveTargetCollectionId(
  userId: string,
  preferredCollectionId?: string
): Promise<string> {
  const supabase = createServerClient();

  if (preferredCollectionId) {
    const { data: preferred } = await supabase
      .from('summer_collections')
      .select('id')
      .eq('id', preferredCollectionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (preferred?.id) {
      return preferred.id;
    }
  }

  const { data: latest } = await supabase
    .from('summer_collections')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.id) {
    return latest.id;
  }

  const { data: created, error: createError } = await supabase
    .from('summer_collections')
    .insert({
      user_id: userId,
      name: 'Knowledge Gap Auto Collection',
      description: 'Auto-created for knowledge gap remediation actions',
      embedding_provider: 'voyage',
      embedding_model: 'voyage-3',
      embedding_dimensions: 1024,
    })
    .select('id')
    .single();

  if (createError || !created?.id) {
    throw new Error(`Failed to resolve target collection: ${createError?.message ?? 'Unknown error'}`);
  }

  return created.id;
}

async function resolvePermittedOrganizationId(
  userId: string,
  requestedOrganizationId?: string
): Promise<string | null> {
  if (!requestedOrganizationId) {
    return null;
  }

  const supabase = createServerClient();
  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('organization_id', requestedOrganizationId)
    .eq('user_id', userId)
    .single();

  if (error || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw new Error('Organization access denied for source connection');
  }

  return membership.organization_id;
}

function resolveFederatedProvider(
  sourceType: string,
  config: Record<string, unknown>
): string {
  const configuredProvider = getStringParam(config, ['provider'])?.toLowerCase();
  if (configuredProvider && VALID_FEDERATED_PROVIDERS.has(configuredProvider)) {
    return configuredProvider;
  }

  switch (sourceType) {
    case 'database':
      return 'supabase';
    case 'agent':
    case 'http':
    default:
      return 'custom';
  }
}

function resolveSourceCapabilities(
  sourceType: string,
  config: Record<string, unknown>
): Record<string, boolean> {
  const defaults: Record<string, boolean> =
    sourceType === 'database'
      ? { vector: true, keyword: true, hybrid: true }
      : { vector: true, keyword: false, hybrid: false };

  const configured = config.capabilities;
  if (!configured || typeof configured !== 'object') {
    return defaults;
  }

  const configuredObj = configured as Record<string, unknown>;
  const merged: Record<string, boolean> = { ...defaults };

  for (const key of ['vector', 'keyword', 'hybrid']) {
    if (typeof configuredObj[key] === 'boolean') {
      merged[key] = configuredObj[key] as boolean;
    }
  }

  return merged;
}

async function fetchRemoteContent(
  url: string,
  timeoutMs: number,
  mimeTypeHint?: string
): Promise<RemoteContent> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { response, finalUrl } = await fetchWithValidatedRedirects(url, controller.signal);

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const responseContentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const hintedContentType = (mimeTypeHint ?? '').toLowerCase();
    const contentType = responseContentType || hintedContentType;
    const buffer = await readResponseBufferWithLimit(response, MAX_REMOTE_CONTENT_BYTES);

    if (buffer.byteLength === 0) {
      throw new Error('Fetched content is empty');
    }

    if (
      responseContentType.includes('application/pdf') ||
      (!responseContentType && hintedContentType.includes('application/pdf')) ||
      finalUrl.toLowerCase().endsWith('.pdf')
    ) {
      const pdfText = await extractPdfText(buffer);
      return {
        text: normalizeIndexText(pdfText),
        contentType: 'application/pdf',
        title: deriveTitleFromUrl(finalUrl),
      };
    }

    const rawText = buffer.toString('utf-8');
    if (contentType.includes('text/html') || looksLikeHtml(rawText)) {
      const parsed = extractHtmlText(rawText);
      return {
        text: normalizeIndexText(parsed.text),
        contentType: contentType || 'text/html',
        title: parsed.title ?? deriveTitleFromUrl(finalUrl),
      };
    }

    return {
      text: normalizeIndexText(rawText),
      contentType: contentType || 'text/plain',
      title: deriveTitleFromUrl(finalUrl),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Fetch timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function parseContentLength(response: Response): number | null {
  const raw = response.headers.get('content-length');
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

async function readResponseBufferWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredSize = parseContentLength(response);
  if (declaredSize !== null && declaredSize > maxBytes) {
    throw new Error(`Fetched content exceeds ${maxBytes} bytes`);
  }

  if (!response.body) {
    const fallback = Buffer.from(await response.arrayBuffer());
    if (fallback.byteLength > maxBytes) {
      throw new Error(`Fetched content exceeds ${maxBytes} bytes`);
    }
    return fallback;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = value ?? new Uint8Array();
      if (chunk.byteLength === 0) {
        continue;
      }

      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Ignore cancellation errors
        }
        throw new Error(`Fetched content exceeds ${maxBytes} bytes`);
      }

      chunks.push(Buffer.from(chunk));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

async function fetchWithValidatedRedirects(
  initialUrl: string,
  signal: AbortSignal
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;

  for (let redirects = 0; redirects <= MAX_FETCH_REDIRECTS; redirects++) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        Accept: 'text/html,text/plain,text/markdown,application/json,application/pdf;q=0.9,*/*;q=0.5',
        'User-Agent': 'SeiznKnowledgeGapBot/1.0 (+https://seizn.com)',
      },
    });

    if (!isRedirectStatus(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    if (redirects === MAX_FETCH_REDIRECTS) {
      throw new Error(`Too many redirects (max ${MAX_FETCH_REDIRECTS})`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(`Redirect response missing location header (${response.status})`);
    }

    const nextUrl = new URL(location, currentUrl).toString();
    currentUrl = await normalizeOutboundUrl(nextUrl);
  }

  throw new Error('Redirect resolution failed');
}

function looksLikeHtml(content: string): boolean {
  return /<html[\s>]|<body[\s>]|<main[\s>]|<article[\s>]|<p[\s>]/i.test(content);
}

function extractHtmlText(rawHtml: string): { title?: string; text: string } {
  const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : undefined;

  const text = rawHtml
    .replace(/<(script|style|noscript|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|section|article|h[1-6]|tr|td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return {
    title: title || undefined,
    text: decodeHtmlEntities(text),
  };
}

function decodeHtmlEntities(value: string): string {
  const map: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
  };

  return value
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCharCode(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-zA-Z0-9#]+);/g, (full, entity) => map[entity] ?? full);
}

function normalizeIndexText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_INDEXABLE_TEXT_CHARS);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text ?? '';
  } finally {
    await parser.destroy();
  }
}

function countSuccessfulDocuments(result: {
  indexed_count: number;
  results?: Array<{ status: string }>;
}): number {
  if (Array.isArray(result.results) && result.results.length > 0) {
    return result.results.filter((item) => item.status !== 'error').length;
  }

  return Math.max(0, result.indexed_count);
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
