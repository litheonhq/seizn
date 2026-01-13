/**
 * Collection Router
 *
 * Intelligent routing of queries to collections based on:
 * - Query characteristics
 * - Collection metadata/capabilities
 * - Latency/budget constraints
 * - Federated source availability
 */
import { createServerClient } from '@/lib/supabase';
import type { FederatedBinding, FederatedCapabilities } from '../federated/types';
import type { BudgetConfig } from '@/lib/core/primitives';

export type RoutingStrategy = 'single' | 'broadcast' | 'selective' | 'cascading';

export interface CollectionProfile {
  collectionId: string;
  name: string;
  provider: 'local' | 'pinecone' | 'weaviate' | 'azure_ai_search' | 'vespa' | 'custom';
  capabilities: FederatedCapabilities;
  avgLatencyMs: number;
  documentCount: number;
  lastSyncedAt?: Date;
  isActive: boolean;
  tags?: string[];
}

export interface RoutingDecision {
  strategy: RoutingStrategy;
  selectedCollections: string[];
  federated: boolean;
  reason: string;
  estimatedLatencyMs: number;
  perCollectionBudgetMs: number;
  warnings: string[];
}

export interface CollectionRouterParams {
  userId: string;
  primaryCollectionId: string;
  query: string;
  mode: 'vector' | 'keyword' | 'hybrid';
  budget: BudgetConfig;
  enableFederated?: boolean;
  preferredTags?: string[];
  maxCollections?: number;
}

// Per-provider latency estimates (p50)
const PROVIDER_LATENCY_ESTIMATES: Record<string, number> = {
  local: 30, // Supabase pgvector
  pinecone: 50,
  weaviate: 45,
  azure_ai_search: 60,
  vespa: 55,
  custom: 100, // Conservative estimate for unknown providers
};

// Mode capability requirements
const MODE_CAPABILITIES: Record<string, keyof FederatedCapabilities> = {
  vector: 'vector',
  keyword: 'keyword',
  hybrid: 'hybrid',
};

/**
 * Get collection profiles for a user
 */
export async function getCollectionProfiles(
  userId: string,
  collectionIds?: string[]
): Promise<CollectionProfile[]> {
  const supabase = createServerClient();
  const profiles: CollectionProfile[] = [];

  // Get local collections
  let localQuery = supabase
    .from('summer_collections')
    .select('id, name, document_count, created_at, updated_at')
    .eq('user_id', userId);

  if (collectionIds) {
    localQuery = localQuery.in('id', collectionIds);
  }

  const { data: localCollections } = await localQuery;

  for (const col of localCollections ?? []) {
    profiles.push({
      collectionId: col.id,
      name: col.name,
      provider: 'local',
      capabilities: { vector: true, keyword: true, hybrid: true },
      avgLatencyMs: PROVIDER_LATENCY_ESTIMATES.local,
      documentCount: col.document_count ?? 0,
      isActive: true,
    });
  }

  // Get federated bindings
  const { data: bindings } = await supabase
    .from('summer_federated_bindings')
    .select(`
      id,
      collection_id,
      remote_collection,
      is_active,
      last_sync_at,
      summer_federated_sources (
        id, name, provider, capabilities, is_active
      )
    `)
    .eq('user_id', userId);

  for (const binding of bindings ?? []) {
    const source = (binding as any).summer_federated_sources;
    if (!source || !source.is_active || !binding.is_active) continue;

    profiles.push({
      collectionId: binding.id,
      name: `${source.name}:${binding.remote_collection}`,
      provider: source.provider,
      capabilities: source.capabilities ?? { vector: true },
      avgLatencyMs: PROVIDER_LATENCY_ESTIMATES[source.provider] ?? PROVIDER_LATENCY_ESTIMATES.custom,
      documentCount: 0, // Unknown for federated
      lastSyncedAt: binding.last_sync_at ? new Date(binding.last_sync_at) : undefined,
      isActive: true,
    });
  }

  return profiles;
}

/**
 * Route query to appropriate collections
 */
export async function routeQuery(params: CollectionRouterParams): Promise<RoutingDecision> {
  const {
    userId,
    primaryCollectionId,
    query,
    mode,
    budget,
    enableFederated = false,
    preferredTags = [],
    maxCollections = 5,
  } = params;

  const warnings: string[] = [];

  // Get collection profiles
  const profiles = await getCollectionProfiles(userId);
  const primaryProfile = profiles.find((p) => p.collectionId === primaryCollectionId);

  if (!primaryProfile) {
    return {
      strategy: 'single',
      selectedCollections: [primaryCollectionId],
      federated: false,
      reason: 'Primary collection not found in profiles; using as-is.',
      estimatedLatencyMs: PROVIDER_LATENCY_ESTIMATES.local,
      perCollectionBudgetMs: budget.latencyBudgetMs,
      warnings: ['Primary collection profile not found'],
    };
  }

  // Single collection mode (no federation)
  if (!enableFederated) {
    return {
      strategy: 'single',
      selectedCollections: [primaryCollectionId],
      federated: false,
      reason: 'Federation disabled; routing to primary collection only.',
      estimatedLatencyMs: primaryProfile.avgLatencyMs,
      perCollectionBudgetMs: budget.latencyBudgetMs,
      warnings: [],
    };
  }

  // Filter collections by capability
  const requiredCapability = MODE_CAPABILITIES[mode];
  const capableCollections = profiles.filter((p) => {
    if (!p.isActive) return false;
    if (!p.capabilities[requiredCapability]) return false;
    return true;
  });

  if (capableCollections.length === 0) {
    warnings.push(`No collections support ${mode} mode`);
    return {
      strategy: 'single',
      selectedCollections: [primaryCollectionId],
      federated: false,
      reason: `No collections support ${mode} mode; falling back to primary.`,
      estimatedLatencyMs: primaryProfile.avgLatencyMs,
      perCollectionBudgetMs: budget.latencyBudgetMs,
      warnings,
    };
  }

  // Calculate time budget
  const availableLatencyMs = budget.latencyBudgetMs * 0.7; // Reserve 30% for merging/reranking

  // Determine strategy based on available budget
  if (capableCollections.length === 1) {
    return {
      strategy: 'single',
      selectedCollections: [capableCollections[0].collectionId],
      federated: capableCollections[0].provider !== 'local',
      reason: 'Only one capable collection available.',
      estimatedLatencyMs: capableCollections[0].avgLatencyMs,
      perCollectionBudgetMs: availableLatencyMs,
      warnings,
    };
  }

  // Sort by latency (fastest first)
  const sortedByLatency = [...capableCollections].sort(
    (a, b) => a.avgLatencyMs - b.avgLatencyMs
  );

  // Selective routing: pick collections that fit within budget
  const selectedCollections: CollectionProfile[] = [];
  let estimatedTotalLatency = 0;

  // Always include primary if capable
  if (capableCollections.some((c) => c.collectionId === primaryCollectionId)) {
    const primary = capableCollections.find((c) => c.collectionId === primaryCollectionId)!;
    selectedCollections.push(primary);
    estimatedTotalLatency = primary.avgLatencyMs;
  }

  // Add more collections (parallel execution means we take max latency)
  for (const col of sortedByLatency) {
    if (selectedCollections.some((s) => s.collectionId === col.collectionId)) continue;
    if (selectedCollections.length >= maxCollections) break;

    // For parallel execution, total latency is max of all sources
    const newMaxLatency = Math.max(estimatedTotalLatency, col.avgLatencyMs);

    if (newMaxLatency <= availableLatencyMs) {
      selectedCollections.push(col);
      estimatedTotalLatency = newMaxLatency;
    } else if (selectedCollections.length === 0) {
      // Accept first collection even if over budget
      selectedCollections.push(col);
      estimatedTotalLatency = col.avgLatencyMs;
      warnings.push(`Collection ${col.name} exceeds latency budget`);
      break;
    }
  }

  const strategy: RoutingStrategy =
    selectedCollections.length === 1
      ? 'single'
      : selectedCollections.length === capableCollections.length
        ? 'broadcast'
        : 'selective';

  const federated = selectedCollections.some((c) => c.provider !== 'local');
  const perCollectionBudgetMs = Math.floor(availableLatencyMs / Math.max(1, selectedCollections.length));

  return {
    strategy,
    selectedCollections: selectedCollections.map((c) => c.collectionId),
    federated,
    reason: `${strategy} routing to ${selectedCollections.length} collection(s) based on ${mode} capability and budget.`,
    estimatedLatencyMs: estimatedTotalLatency,
    perCollectionBudgetMs,
    warnings,
  };
}

/**
 * Cascading router: try fast sources first, fall back to slower ones if needed
 */
export async function cascadingRoute(
  params: CollectionRouterParams & {
    minResults: number;
    retriever: (collectionId: string, timeoutMs: number) => Promise<{ count: number; results: unknown[] }>;
  }
): Promise<{
  results: unknown[];
  sourcesUsed: string[];
  totalLatencyMs: number;
}> {
  const {
    userId,
    primaryCollectionId,
    mode,
    budget,
    minResults,
    retriever,
  } = params;

  const profiles = await getCollectionProfiles(userId);
  const requiredCapability = MODE_CAPABILITIES[mode];

  const capableCollections = profiles
    .filter((p) => p.isActive && p.capabilities[requiredCapability])
    .sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);

  // Ensure primary is first
  const primaryIdx = capableCollections.findIndex((c) => c.collectionId === primaryCollectionId);
  if (primaryIdx > 0) {
    const [primary] = capableCollections.splice(primaryIdx, 1);
    capableCollections.unshift(primary);
  }

  const allResults: unknown[] = [];
  const sourcesUsed: string[] = [];
  let totalLatencyMs = 0;
  let remainingBudgetMs = budget.latencyBudgetMs;

  for (const col of capableCollections) {
    if (allResults.length >= minResults) break;
    if (remainingBudgetMs < col.avgLatencyMs * 0.5) break; // Not enough budget for this source

    const startTime = Date.now();
    const timeoutMs = Math.min(remainingBudgetMs, col.avgLatencyMs * 2);

    try {
      const { results } = await retriever(col.collectionId, timeoutMs);
      allResults.push(...results);
      sourcesUsed.push(col.collectionId);
    } catch {
      // Source failed, continue to next
    }

    const elapsed = Date.now() - startTime;
    totalLatencyMs += elapsed;
    remainingBudgetMs -= elapsed;
  }

  return {
    results: allResults,
    sourcesUsed,
    totalLatencyMs,
  };
}

/**
 * Get routing recommendations based on historical performance
 */
export async function getRoutingRecommendations(
  userId: string,
  collectionId: string
): Promise<{
  recommendedStrategy: RoutingStrategy;
  suggestedCollections: string[];
  rationale: string;
}> {
  const profiles = await getCollectionProfiles(userId);
  const primary = profiles.find((p) => p.collectionId === collectionId);

  if (!primary) {
    return {
      recommendedStrategy: 'single',
      suggestedCollections: [collectionId],
      rationale: 'Collection not found; defaulting to single.',
    };
  }

  // If primary is local and fast, stick with it
  if (primary.provider === 'local' && primary.avgLatencyMs < 50) {
    return {
      recommendedStrategy: 'single',
      suggestedCollections: [collectionId],
      rationale: 'Local collection with fast response time.',
    };
  }

  // If there are federated sources with better latency, suggest selective routing
  const fasterSources = profiles.filter(
    (p) =>
      p.collectionId !== collectionId &&
      p.avgLatencyMs < primary.avgLatencyMs &&
      p.capabilities.vector
  );

  if (fasterSources.length > 0) {
    return {
      recommendedStrategy: 'selective',
      suggestedCollections: [collectionId, ...fasterSources.slice(0, 2).map((s) => s.collectionId)],
      rationale: `Found ${fasterSources.length} faster source(s); selective routing may improve latency.`,
    };
  }

  return {
    recommendedStrategy: 'single',
    suggestedCollections: [collectionId],
    rationale: 'No faster alternatives available.',
  };
}
