/**
 * Domain Adapter Application
 *
 * Apply trained LoRA adapters to embeddings for domain-specific retrieval.
 * Provides CRUD operations for domain adapters and embedding transformation.
 */

import { createServerClient } from '@/lib/supabase';
import {
  DomainAdapter,
  CreateAdapterParams,
  UpdateAdapterParams,
  AdapterFilter,
  AdapterStatus,
} from './types';
import { applyLoRA } from './trainer';

// =============================================================================
// Adapter CRUD Operations
// =============================================================================

/**
 * Create a new domain adapter
 */
export async function createAdapter(
  userId: string,
  params: CreateAdapterParams
): Promise<DomainAdapter> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('domain_adapters')
    .insert({
      user_id: userId,
      name: params.name,
      description: params.description,
      collection_id: params.collectionId,
      domain_type: params.domainType,
      adapter_rank: params.adapterRank ?? 8,
      scale: params.scale ?? 1.0,
      auto_retrain: params.autoRetrain ?? false,
      retrain_threshold: params.retrainThreshold ?? 100,
    })
    .select()
    .single();

  if (error) throw error;

  return mapDbToAdapter(data);
}

/**
 * Get adapter by ID
 */
export async function getAdapter(adapterId: string): Promise<DomainAdapter | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('domain_adapters')
    .select('*')
    .eq('id', adapterId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return mapDbToAdapter(data);
}

/**
 * Get adapter by ID for a specific user (with ownership check)
 */
export async function getAdapterForUser(
  adapterId: string,
  userId: string
): Promise<DomainAdapter | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('domain_adapters')
    .select('*')
    .eq('id', adapterId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return mapDbToAdapter(data);
}

/**
 * List adapters for a user
 */
export async function listAdapters(
  userId: string,
  filter?: AdapterFilter,
  page = 1,
  pageSize = 20
): Promise<{ adapters: DomainAdapter[]; total: number }> {
  const supabase = createServerClient();

  let query = supabase
    .from('domain_adapters')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  // Apply filters
  if (filter?.status) {
    query = query.eq('status', filter.status);
  }
  if (filter?.domainType) {
    query = query.eq('domain_type', filter.domainType);
  }
  if (filter?.collectionId) {
    query = query.eq('collection_id', filter.collectionId);
  }

  // Pagination
  const offset = (page - 1) * pageSize;
  query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;

  if (error) throw error;

  return {
    adapters: data.map(mapDbToAdapter),
    total: count ?? 0,
  };
}

/**
 * Update an adapter
 */
export async function updateAdapter(
  adapterId: string,
  userId: string,
  params: UpdateAdapterParams
): Promise<DomainAdapter> {
  const supabase = createServerClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.name !== undefined) updateData.name = params.name;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.domainType !== undefined) updateData.domain_type = params.domainType;
  if (params.scale !== undefined) updateData.scale = params.scale;
  if (params.autoRetrain !== undefined) updateData.auto_retrain = params.autoRetrain;
  if (params.retrainThreshold !== undefined)
    updateData.retrain_threshold = params.retrainThreshold;

  const { data, error } = await supabase
    .from('domain_adapters')
    .update(updateData)
    .eq('id', adapterId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;

  return mapDbToAdapter(data);
}

/**
 * Delete an adapter
 */
export async function deleteAdapter(adapterId: string, userId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('domain_adapters')
    .delete()
    .eq('id', adapterId)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Update adapter weights after training
 */
export async function updateAdapterWeights(
  adapterId: string,
  weightsA: number[][],
  weightsB: number[][],
  validationMrr: number
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('domain_adapters')
    .update({
      weights_a: weightsA,
      weights_b: weightsB,
      validation_mrr: validationMrr,
      status: 'ready' as AdapterStatus,
      last_trained_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', adapterId);

  if (error) throw error;
}

/**
 * Update adapter status
 */
export async function updateAdapterStatus(
  adapterId: string,
  status: AdapterStatus
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('domain_adapters')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', adapterId);

  if (error) throw error;
}

// =============================================================================
// Embedding Transformation
// =============================================================================

/**
 * Apply adapter to a single embedding
 */
export function applyAdapterToEmbedding(
  embedding: number[],
  adapter: DomainAdapter
): number[] {
  if (!adapter.weightsA || !adapter.weightsB) {
    // Return original embedding if adapter has no weights
    return embedding;
  }

  if (adapter.status !== 'ready') {
    // Only apply if adapter is trained
    return embedding;
  }

  return applyLoRA(embedding, adapter.weightsA, adapter.weightsB, adapter.scale);
}

/**
 * Apply adapter to multiple embeddings
 */
export function applyAdapterToEmbeddings(
  embeddings: number[][],
  adapter: DomainAdapter
): number[][] {
  if (!adapter.weightsA || !adapter.weightsB || adapter.status !== 'ready') {
    return embeddings;
  }

  return embeddings.map((emb) =>
    applyLoRA(emb, adapter.weightsA!, adapter.weightsB!, adapter.scale)
  );
}

/**
 * Apply adapter to query embedding (convenience function)
 */
export async function applyAdapterToQuery(
  adapterId: string,
  queryEmbedding: number[]
): Promise<{ adapted: number[]; original: number[]; applied: boolean }> {
  const adapter = await getAdapter(adapterId);

  if (!adapter) {
    return { adapted: queryEmbedding, original: queryEmbedding, applied: false };
  }

  const adapted = applyAdapterToEmbedding(queryEmbedding, adapter);
  const applied = adapter.status === 'ready' && !!adapter.weightsA;

  return { adapted, original: queryEmbedding, applied };
}

/**
 * Get adapter for collection (if configured)
 */
export async function getAdapterForCollection(
  userId: string,
  collectionId: string
): Promise<DomainAdapter | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('domain_adapters')
    .select('*')
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .eq('status', 'ready')
    .order('validation_mrr', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data ? mapDbToAdapter(data) : null;
}

/**
 * Get best adapter for domain type
 */
export async function getBestAdapterForDomain(
  userId: string,
  domainType: string
): Promise<DomainAdapter | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('domain_adapters')
    .select('*')
    .eq('user_id', userId)
    .eq('domain_type', domainType)
    .eq('status', 'ready')
    .order('validation_mrr', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data ? mapDbToAdapter(data) : null;
}

// =============================================================================
// Retrieval Pipeline Integration
// =============================================================================

export interface AdapterConfig {
  adapterId?: string;
  collectionId?: string;
  domainType?: string;
  autoSelect?: boolean;
}

/**
 * Select appropriate adapter based on config
 */
export async function selectAdapter(
  userId: string,
  config: AdapterConfig
): Promise<DomainAdapter | null> {
  // Explicit adapter ID takes precedence
  if (config.adapterId) {
    return getAdapterForUser(config.adapterId, userId);
  }

  // Try collection-specific adapter
  if (config.collectionId) {
    const adapter = await getAdapterForCollection(userId, config.collectionId);
    if (adapter) return adapter;
  }

  // Try domain-specific adapter
  if (config.domainType) {
    const adapter = await getBestAdapterForDomain(userId, config.domainType);
    if (adapter) return adapter;
  }

  // Auto-select: return the best performing adapter for the user
  if (config.autoSelect) {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('domain_adapters')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ready')
      .not('validation_mrr', 'is', null)
      .order('validation_mrr', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return data ? mapDbToAdapter(data) : null;
  }

  return null;
}

/**
 * Transform query embedding using selected adapter
 */
export async function transformQueryWithAdapter(
  userId: string,
  queryEmbedding: number[],
  config: AdapterConfig
): Promise<{
  embedding: number[];
  adapterId?: string;
  applied: boolean;
}> {
  const adapter = await selectAdapter(userId, config);

  if (!adapter) {
    return { embedding: queryEmbedding, applied: false };
  }

  const transformed = applyAdapterToEmbedding(queryEmbedding, adapter);

  return {
    embedding: transformed,
    adapterId: adapter.id,
    applied: adapter.status === 'ready' && !!adapter.weightsA,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Compute adapter statistics
 */
export async function getAdapterStats(
  userId: string
): Promise<{
  total: number;
  ready: number;
  training: number;
  untrained: number;
  stale: number;
  totalSignals: number;
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('domain_adapters')
    .select('status, training_samples')
    .eq('user_id', userId);

  if (error) throw error;

  const stats = {
    total: data.length,
    ready: 0,
    training: 0,
    untrained: 0,
    stale: 0,
    totalSignals: 0,
  };

  for (const adapter of data) {
    stats[adapter.status as keyof typeof stats]++;
    stats.totalSignals += adapter.training_samples || 0;
  }

  return stats;
}

// =============================================================================
// Mapping Functions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbToAdapter(row: any): DomainAdapter {
  return {
    id: row.id,
    userId: row.user_id,
    collectionId: row.collection_id,
    name: row.name,
    description: row.description,
    domainType: row.domain_type,
    adapterRank: row.adapter_rank,
    weightsA: row.weights_a,
    weightsB: row.weights_b,
    scale: row.scale,
    trainingSamples: row.training_samples,
    positiveSamples: row.positive_samples,
    negativeSamples: row.negative_samples,
    lastTrainedAt: row.last_trained_at ? new Date(row.last_trained_at) : undefined,
    validationMrr: row.validation_mrr,
    status: row.status as AdapterStatus,
    autoRetrain: row.auto_retrain,
    retrainThreshold: row.retrain_threshold,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export { mapDbToAdapter };
