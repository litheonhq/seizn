import type { RetrievalMode, VectorSearchResult } from '../types';
import { loadFederatedBindings } from './registry';
import { createFederatedSource } from './factory';

export interface FederatedRetrieveParams {
  userId: string;
  collectionId: string;
  queryText: string;
  queryEmbedding: number[];
  mode: RetrievalMode;
  topKPerSource?: number;
  maxSources?: number;
}

/**
 * Federated retrieval:
 * - Finds bindings for the Seizn collection
 * - Queries each remote source in parallel
 * - Returns merged candidates (global rerank happens later)
 */
export async function federatedRetrieve(params: FederatedRetrieveParams): Promise<VectorSearchResult[]> {
  const bindings = await loadFederatedBindings({
    userId: params.userId,
    collectionId: params.collectionId,
  });

  if (bindings.length === 0) return [];

  const maxSources = params.maxSources ?? 3;
  const topKPerSource = params.topKPerSource ?? 10;

  const sliced = bindings.slice(0, maxSources);

  const results = await Promise.allSettled(
    sliced.map(async (b) => {
      const source = createFederatedSource({
        sourceId: b.sourceId,
        provider: b.source.provider,
        capabilities: b.source.capabilities,
      });

      return source.search({
        userId: params.userId,
        queryText: params.queryText,
        queryEmbedding: params.queryEmbedding,
        topK: topKPerSource,
        mode: params.mode,
        binding: b,
      });
    })
  );

  const merged: VectorSearchResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value);
  }

  // Deduplicate by chunkId (keep max similarity)
  const byChunk = new Map<string, VectorSearchResult>();
  for (const item of merged) {
    const existing = byChunk.get(item.chunkId);
    if (!existing || (item.similarity ?? 0) > (existing.similarity ?? 0)) {
      byChunk.set(item.chunkId, item);
    }
  }

  return Array.from(byChunk.values());
}
