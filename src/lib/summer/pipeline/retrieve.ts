/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import type { RetrieveParams, RetrieveResponse, VectorSearchResult } from '../types';
import { getEmbeddingProvider } from '../embedding';
import { getRerankProvider } from '../rerank';
import { getVectorStore } from '../vectorstore';
import { planRetrieval } from '../autopilot/planner';
import { federatedRetrieve } from '../federated/search';
import { recommendEfSearch } from '../tuning/hnsw';

import { startTrace, addEvent, finishTrace } from '@/lib/fall/flight-recorder';
import { generateReceiptFromResult } from '@/lib/retrieval/receipt';

function dedupeByChunkId(results: VectorSearchResult[]): VectorSearchResult[] {
  const map = new Map<string, VectorSearchResult>();

  for (const r of results) {
    const existing = map.get(r.chunkId);
    if (!existing || (r.similarity ?? 0) > (existing.similarity ?? 0)) {
      map.set(r.chunkId, r);
    }
  }

  return Array.from(map.values());
}

function buildRerankDelta(beforeIds: string[], afterIds: string[]): Array<{
  id: string;
  oldRank: number;
  newRank: number;
}> {
  const oldIndex = new Map<string, number>();
  beforeIds.forEach((id, i) => oldIndex.set(id, i + 1));

  return afterIds.map((id, i) => ({
    id,
    oldRank: oldIndex.get(id) ?? -1,
    newRank: i + 1,
  }));
}

export async function retrieve(params: RetrieveParams): Promise<RetrieveResponse> {
  const requestId = randomUUID();
  const startedAt = new Date().toISOString();

  const t0 = Date.now();

  const traceHandle = await startTrace({
    requestId,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    plan: params.plan,
    collectionId: params.collectionId,
    queryText: params.query,
    autopilotEnabled: params.autopilot ?? true,
  });

  // 1) Autopilot planning
  const plan = await planRetrieval({
    requestId,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    plan: params.plan,
    collectionId: params.collectionId,
    query: params.query,
    autopilotEnabled: params.autopilot ?? true,
    override: params.override,
    experimentId: params.experimentId,
  });

  // Optional: tune ef_search unless caller overrides it.
  if ((params.autopilot ?? true) && params.override?.searchEf == null) {
    const rec = recommendEfSearch({ topK: plan.config.topK, plan: params.plan });
    plan.config.searchEf = rec.efSearch;
  }

  // 2) Embed query
  const embedder = getEmbeddingProvider();
  const embedStart = Date.now();
  const [queryEmbedding] = await embedder.embed([params.query], 'query');
  const embedMs = Date.now() - embedStart;

  addEvent(traceHandle, 'embed', {
    provider: embedder.id,
    dimensions: embedder.dimensions,
    latency_ms: embedMs,
  });

  // 3) Retrieve candidates (managed)
  const store = getVectorStore();
  const searchStart = Date.now();

  let candidates: VectorSearchResult[] = [];

  if (plan.config.mode === 'vector') {
    candidates = await store.search({
      userId: params.userId,
      collectionId: params.collectionId,
      queryEmbedding,
      topK: plan.config.topK,
      threshold: plan.config.threshold,
      searchEf: plan.config.searchEf,
    });
  } else if (plan.config.mode === 'keyword') {
    candidates = await store.keywordSearch({
      userId: params.userId,
      collectionId: params.collectionId,
      queryText: params.query,
      topK: plan.config.topK,
    });
  } else {
    candidates = await store.hybridSearch({
      userId: params.userId,
      collectionId: params.collectionId,
      queryText: params.query,
      queryEmbedding,
      topK: plan.config.topK,
      threshold: plan.config.threshold,
      keywordWeight: plan.config.keywordWeight,
      vectorWeight: plan.config.vectorWeight,
      searchEf: plan.config.searchEf,
    });
  }

  candidates = candidates.map((c) => ({ ...c, source: c.source ?? 'managed' }));

  const searchMs = Date.now() - searchStart;

  addEvent(traceHandle, 'candidates', {
    source: 'managed',
    mode: plan.config.mode,
    topK: plan.config.topK,
    threshold: plan.config.threshold,
    searchEf: plan.config.searchEf,
    count: candidates.length,
    // Avoid logging huge payloads; keep only ids + scores.
    results: candidates.slice(0, 50).map((r, i) => ({
      rank: i + 1,
      chunkId: r.chunkId,
      similarity: r.similarity,
      keywordRank: r.keywordRank,
      combinedScore: r.combinedScore,
    })),
  });

  // 4) Federated retrieval (optional)
  if (params.federated) {
    const fedStart = Date.now();
    const fed = await federatedRetrieve({
      userId: params.userId,
      collectionId: params.collectionId,
      queryText: params.query,
      queryEmbedding,
      mode: plan.config.mode,
      topKPerSource: Math.min(10, plan.config.topK),
    });

    const fedMs = Date.now() - fedStart;

    addEvent(traceHandle, 'candidates', {
      source: 'federated',
      mode: plan.config.mode,
      topKPerSource: Math.min(10, plan.config.topK),
      count: fed.length,
      latency_ms: fedMs,
      results: fed.slice(0, 50).map((r, i) => ({
        rank: i + 1,
        chunkId: r.chunkId,
        similarity: r.similarity,
        source: r.source,
      })),
    });

    candidates = dedupeByChunkId([...candidates, ...fed]);
  }

  // 5) Rerank
  let rerankMs = 0;
  let finalResults = candidates.slice(0, plan.config.topK);

  if (plan.config.rerank && candidates.length > 0) {
    const reranker = getRerankProvider();

    const docs = candidates.slice(0, plan.config.rerankTopN).map((r) => ({
      id: r.chunkId,
      text: r.text,
      metadata: {
        documentId: r.documentId,
        ...r.metadata,
      },
    }));

    const beforeIds = docs.map((d) => d.id);

    const rerankStart = Date.now();
    const reranked = await reranker.rerank(params.query, docs, { topN: plan.config.rerankTopN });
    rerankMs = Date.now() - rerankStart;

    const afterIds = reranked.map((r) => r.id);
    const idToCandidate = new Map(candidates.map((c) => [c.chunkId, c] as const));

    const rerankedCandidates = afterIds
      .map((id) => idToCandidate.get(id))
      .filter(Boolean) as VectorSearchResult[];

    finalResults = rerankedCandidates.slice(0, plan.config.topK);

    addEvent(traceHandle, 'rerank', {
      provider: reranker.id,
      topN: plan.config.rerankTopN,
      latency_ms: rerankMs,
      delta: buildRerankDelta(beforeIds, afterIds).slice(0, 50),
    });
  }

  // 6) Final context selection (logged for Answer Contract)
  addEvent(traceHandle, 'context', {
    selectedChunkIds: finalResults.slice(0, 12).map((r) => r.chunkId),
  });

  const totalMs = Date.now() - t0;

  const timings = {
    embedQuery: embedMs,
    vectorSearch: searchMs,
    rerank: plan.config.rerank ? rerankMs : undefined,
    total: totalMs,
  };

  const trace = {
    requestId,
    startedAt,
    timingsMs: timings,
    autopilot: {
      enabled: params.autopilot ?? true,
      reason: plan.reason,
      effectiveConfig: plan.config,
    },
    experiment: plan.experiment
      ? {
          experimentId: plan.experiment.experimentId,
          armId: plan.experiment.armId,
          armName: plan.experiment.armName,
        }
      : undefined,
    sampled: traceHandle.sampled,
  };

  await finishTrace(traceHandle, {
    autopilotReason: plan.reason,
    effectiveConfig: plan.config as any,
    timingsMs: timings as any,
    resultsCount: finalResults.length,
    error: undefined,
    experimentId: plan.experiment?.experimentId,
    armId: plan.experiment?.armId,
  });


  // Generate query receipt
  const receipt = generateReceiptFromResult({
    traceId: requestId,
    queryText: params.query,
    collectionId: params.collectionId,
    plan: params.plan,
    config: {
      searchType: plan.config.mode === 'hybrid' ? 'hybrid' : plan.config.mode === 'keyword' ? 'keyword' : 'semantic',
      topK: plan.config.topK,
      rerankEnabled: plan.config.rerank,
      rerankTopN: plan.config.rerankTopN,
    },
    cost: {
      total: 0,
      tokens: {
        embeddingInput: Math.ceil(params.query.length / 4),
      },
    },
    timings: {
      embedding: embedMs,
      search: searchMs,
      rerank: plan.config.rerank ? rerankMs : 0,
      total: totalMs,
    },
    resultsCount: finalResults.length,
    cacheHit: false,
  });

  return {
    results: finalResults,
    config: plan.config,
    trace: params.includeTrace ? trace : undefined,
    receipt,
  };
}
