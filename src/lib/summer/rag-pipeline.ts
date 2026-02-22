import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Seizn Summer - RAG Pipeline
 *
 * Full Retrieval-Augmented Generation pipeline:
 * 1. Search (vector/keyword/hybrid)
 * 2. Rerank (optional, based on plan)
 * 3. Context construction
 * 4. LLM generation (Claude/OpenAI)
 * 5. Response with sources
 *
 * Features:
 * - Budget-aware planning with automatic degradation
 * - Streaming support (SSE)
 * - Flight Recorder integration for full traceability
 * - Answer Contract verification
 */

import { randomUUID } from 'crypto';
import type { VectorSearchResult } from './types';
import { getEmbeddingProvider } from './embedding';
import { getRerankProvider } from './rerank';
import { getVectorStore } from './vectorstore';
import { federatedRetrieve } from './federated/search';
import { resolveCompetitiveFeatures, type CompetitiveExecutionFeatures } from './competitive/phase-config';
import { inferQueryIntent, type QueryIntentDecision } from './competitive/query-intent';
import {
  expandQueryVariants,
  fuseRetrievalRounds,
  calculateOverlapAtK,
  type RetrievalRound,
} from './competitive/retrieval-fusion';
import { applyTrustGuard } from './competitive/trust-guard';
import { buildAnswerContractSystemPrompt, buildAnswerContractUserPrompt } from './answer-contract/prompt';
import { estimateTokens } from './utils/tokens';
import { createServerClient } from '@/lib/supabase';

import { getPlan, hasFeature } from '@/lib/plan-limits';
import { resolveBudget, applyBudgetLimits, estimateCost } from '@/lib/core/primitives/budget';
import { getActiveAssignment, recordRequestResult } from '@/lib/fall/canary';
import {
  startTrace,
  addEvent,
  addContextEvent,
  finishTrace,
  startSpan,
  endSpan,
  calculateTraceCost,
} from '@/lib/fall/flight-recorder';
import type { TraceHandle, TraceCost } from '@/lib/fall/flight-recorder';

// ===========================================
// Types
// ===========================================

export type RAGSearchType = 'semantic' | 'keyword' | 'hybrid';
export type LLMModel = 'claude-3-5-sonnet' | 'claude-3-5-haiku' | 'gpt-4o' | 'gpt-4o-mini';

export interface RAGOptions {
  /** Search type: semantic, keyword, or hybrid */
  search_type?: RAGSearchType;
  /** Enable reranking (requires plan support) */
  rerank?: boolean;
  /** LLM model to use for generation */
  llm_model?: LLMModel;
  /** Max tokens for LLM output */
  max_tokens?: number;
  /** Enable streaming response */
  stream?: boolean;
  /** Temperature for LLM */
  temperature?: number;
  /** Top-K results to retrieve */
  top_k?: number;
  /** Rerank top-N candidates */
  rerank_top_n?: number;
  /** Enable federated search */
  federated?: boolean;
  /** System prompt override */
  system_prompt?: string;
  /** Include trace in response */
  include_trace?: boolean;
  /** Competitive phase override (0-7) */
  competitive_phase?: number;
  /** Enable aggressive competitive mode */
  competitive_aggressive?: boolean;
  /** Enable intent-aware query routing */
  intent_routing?: boolean;
  /** Enable query expansion */
  query_expansion?: boolean;
  /** Enable late-interaction rerank signal */
  late_interaction?: boolean;
  /** Enable graph context augmentation */
  graph_augmentation?: boolean;
  /** Enable trust guard filtering */
  trust_guard?: boolean;
  /** Enable shadow evaluation metadata */
  shadow_eval?: boolean;
  /** Optional graph id for augmentation */
  graph_id?: string;
  /** Optional blocked retrieval sources */
  blocked_sources?: string[];
}

export interface RAGParams {
  userId: string;
  apiKeyId?: string;
  plan: string;
  collectionId: string;
  query: string;
  options?: RAGOptions;
}

export interface RAGSource {
  id: string;
  content: string;
  score: number;
  documentId?: string;
  metadata?: Record<string, unknown>;
}

export interface RAGUsage {
  embedding_tokens: number;
  llm_input_tokens: number;
  llm_output_tokens: number;
  total_cost_credits: number;
}

export interface RAGTrace {
  trace_id: string;
  request_id: string;
  started_at: string;
  timings_ms: {
    search?: number;
    rerank?: number;
    context_build?: number;
    llm?: number;
    total: number;
  };
  config: {
    search_type: RAGSearchType;
    top_k: number;
    rerank_enabled: boolean;
    llm_model: string;
  };
  budget_info?: {
    degraded: boolean;
    reason?: string;
  };
  competitive?: {
    phase: number;
    aggressive: boolean;
    intent?: QueryIntentDecision;
    expanded_queries?: string[];
    trust_guard_filtered?: number;
    shadow_eval?: {
      mode: 'semantic' | 'keyword' | 'hybrid';
      overlap_at_k: number;
      candidate_count: number;
    };
    graph_augmentation?: {
      graph_id: string;
      source_count: number;
    };
  };
}

export interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  usage: RAGUsage;
  latency_ms: number;
  trace_id: string;
  trace?: RAGTrace;
  competitive?: {
    phase: number;
    aggressive: boolean;
    search_type: RAGSearchType;
    canary?: {
      deployment_id: string;
      assigned_version: 'baseline' | 'canary';
    };
    shadow_eval?: {
      mode: 'semantic' | 'keyword' | 'hybrid';
      overlap_at_k: number;
      candidate_count: number;
    };
  };
}

export interface RAGStreamChunk {
  type: 'content' | 'sources' | 'usage' | 'done' | 'error';
  content?: string;
  sources?: RAGSource[];
  usage?: RAGUsage;
  competitive?: RAGResponse['competitive'];
  latency_ms?: number;
  trace_id?: string;
  error?: string;
}

// ===========================================
// LLM Providers
// ===========================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const MODEL_MAP: Record<LLMModel, { provider: 'anthropic' | 'openai'; modelId: string }> = {
  'claude-3-5-sonnet': { provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' },
  'claude-3-5-haiku': { provider: 'anthropic', modelId: 'claude-3-5-haiku-20241022' },
  'gpt-4o': { provider: 'openai', modelId: 'gpt-4o' },
  'gpt-4o-mini': { provider: 'openai', modelId: 'gpt-4o-mini' },
};

async function callAnthropicLLM(params: {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model: params.modelId,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return {
    text: data.content[0].text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

async function* streamAnthropicLLM(params: {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
}): AsyncGenerator<{ type: 'content' | 'usage'; content?: string; inputTokens?: number; outputTokens?: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model: params.modelId,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield { type: 'content', content: parsed.delta.text };
          }

          if (parsed.type === 'message_delta' && parsed.usage) {
            outputTokens = parsed.usage.output_tokens ?? outputTokens;
          }

          if (parsed.type === 'message_start' && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens ?? 0;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: 'usage', inputTokens, outputTokens };
}

async function callOpenAILLM(params: {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.modelId,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

async function* streamOpenAILLM(params: {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
}): AsyncGenerator<{ type: 'content' | 'usage'; content?: string; inputTokens?: number; outputTokens?: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.modelId,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.choices?.[0]?.delta?.content) {
            yield { type: 'content', content: parsed.choices[0].delta.content };
          }

          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
            outputTokens = parsed.usage.completion_tokens ?? outputTokens;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: 'usage', inputTokens, outputTokens };
}

// ===========================================
// Budget-aware Planner
// ===========================================

interface BudgetPlan {
  searchType: RAGSearchType;
  topK: number;
  rerankEnabled: boolean;
  rerankTopN: number;
  llmModel: LLMModel;
  maxTokens: number;
  degraded: boolean;
  degradeReason?: string;
}

function planWithBudget(params: {
  plan: string;
  requestedOptions: RAGOptions;
  estimatedQueryTokens: number;
}): BudgetPlan {
  const { plan, requestedOptions, estimatedQueryTokens } = params;
  const planConfig = getPlan(plan);
  const budget = resolveBudget(plan);

  // Start with requested options as defaults
  let searchType: RAGSearchType = requestedOptions.search_type ?? 'hybrid';
  let topK = requestedOptions.top_k ?? 10;
  let rerankEnabled = requestedOptions.rerank ?? false;
  let rerankTopN = requestedOptions.rerank_top_n ?? 20;
  let llmModel: LLMModel = requestedOptions.llm_model ?? 'claude-3-5-haiku';
  let maxTokens = requestedOptions.max_tokens ?? 2048;
  let degraded = false;
  let degradeReason: string | undefined;

  // Check feature availability
  if (rerankEnabled && !hasFeature(plan, 'reranking')) {
    rerankEnabled = false;
    degraded = true;
    degradeReason = 'Reranking not available on current plan';
  }

  if (searchType === 'hybrid' && !hasFeature(plan, 'hybridSearch')) {
    searchType = 'semantic';
    degraded = true;
    degradeReason = (degradeReason ? degradeReason + '; ' : '') + 'Hybrid search not available on current plan';
  }

  // Apply budget limits
  const budgetLimits = applyBudgetLimits(
    { topK, rerankTopN, maxTokens },
    budget
  );

  if (budgetLimits.topK < topK) {
    topK = budgetLimits.topK;
    degraded = true;
    degradeReason = (degradeReason ? degradeReason + '; ' : '') + `topK limited to ${topK} by budget`;
  }

  if (budgetLimits.rerankTopN < rerankTopN) {
    rerankTopN = budgetLimits.rerankTopN;
  }

  // Check token limits
  if (maxTokens > planConfig.maxOutputTokens) {
    maxTokens = planConfig.maxOutputTokens;
    degraded = true;
    degradeReason = (degradeReason ? degradeReason + '; ' : '') + `maxTokens limited to ${maxTokens} by plan`;
  }

  // Estimate cost and degrade if necessary
  const estimatedCost = estimateCost({
    embeddingTokens: estimatedQueryTokens,
    searchQueries: 1,
    rerankDocuments: rerankEnabled ? rerankTopN : 0,
  });

  if (estimatedCost > budget.costBudget * 0.8) {
    // Near budget limit - degrade to cheaper options
    if (llmModel === 'claude-3-5-sonnet' || llmModel === 'gpt-4o') {
      llmModel = llmModel === 'claude-3-5-sonnet' ? 'claude-3-5-haiku' : 'gpt-4o-mini';
      degraded = true;
      degradeReason = (degradeReason ? degradeReason + '; ' : '') + `LLM model downgraded due to cost budget`;
    }

    if (rerankEnabled && estimatedCost > budget.costBudget) {
      rerankEnabled = false;
      degraded = true;
      degradeReason = (degradeReason ? degradeReason + '; ' : '') + `Reranking disabled due to cost budget`;
    }
  }

  return {
    searchType,
    topK,
    rerankEnabled,
    rerankTopN,
    llmModel,
    maxTokens,
    degraded,
    degradeReason,
  };
}

// ===========================================
// Helper Functions
// ===========================================

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

function mapRAGSearchType(type: RAGSearchType): 'vector' | 'keyword' | 'hybrid' {
  switch (type) {
    case 'semantic':
      return 'vector';
    case 'keyword':
      return 'keyword';
    case 'hybrid':
      return 'hybrid';
  }
}

function buildContext(results: VectorSearchResult[], maxTokens: number): { id: string; text: string }[] {
  const context: { id: string; text: string }[] = [];
  let totalTokens = 0;

  for (const r of results) {
    const tokens = estimateTokens(r.text);
    if (totalTokens + tokens > maxTokens) break;

    context.push({ id: r.chunkId, text: r.text });
    totalTokens += tokens;
  }

  return context;
}

function buildSources(results: VectorSearchResult[]): RAGSource[] {
  return results.map((r) => ({
    id: r.chunkId,
    content: r.text.slice(0, 500), // Truncate for response
    score: r.combinedScore ?? r.similarity,
    documentId: r.documentId,
    metadata: r.metadata,
  }));
}

interface SearchExecutionResult {
  candidates: VectorSearchResult[];
  searchMs: number;
  effectiveSearchType: RAGSearchType;
  intentDecision?: QueryIntentDecision;
  expandedQueries: string[];
  trustGuardFiltered: number;
}

interface ShadowEvalResult {
  mode: RAGSearchType;
  overlapAtK: number;
  candidateCount: number;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function getTopScore(results: VectorSearchResult[]): number {
  if (results.length === 0) return 0;
  const top = results[0];
  return Number(top.combinedScore ?? top.similarity ?? 0);
}

async function runSearchByType(params: {
  userId: string;
  collectionId: string;
  queryText: string;
  queryEmbedding: number[];
  searchType: RAGSearchType;
  topK: number;
}): Promise<VectorSearchResult[]> {
  const store = getVectorStore();
  const mode = mapRAGSearchType(params.searchType);

  if (mode === 'vector') {
    return store.search({
      userId: params.userId,
      collectionId: params.collectionId,
      queryEmbedding: params.queryEmbedding,
      topK: params.topK,
      threshold: 0.5,
    });
  }

  if (mode === 'keyword') {
    return store.keywordSearch({
      userId: params.userId,
      collectionId: params.collectionId,
      queryText: params.queryText,
      topK: params.topK,
    });
  }

  return store.hybridSearch({
    userId: params.userId,
    collectionId: params.collectionId,
    queryText: params.queryText,
    queryEmbedding: params.queryEmbedding,
    topK: params.topK,
    threshold: 0.5,
    keywordWeight: 0.3,
    vectorWeight: 0.7,
  });
}

async function executeCompetitiveSearch(params: {
  userId: string;
  collectionId: string;
  query: string;
  queryEmbedding: number[];
  topK: number;
  defaultSearchType: RAGSearchType;
  options: RAGOptions;
  features: CompetitiveExecutionFeatures;
  traceHandle: TraceHandle;
}): Promise<SearchExecutionResult> {
  const start = Date.now();
  const embedder = getEmbeddingProvider();
  let effectiveSearchType = params.defaultSearchType;
  let effectiveTopK = params.topK;
  let intentDecision: QueryIntentDecision | undefined;

  if (params.features.intentRouting) {
    intentDecision = inferQueryIntent(params.query, params.defaultSearchType);
    effectiveSearchType = intentDecision.recommendedSearchType;
    effectiveTopK = clampInt(Math.ceil(params.topK * intentDecision.topKMultiplier), params.topK, params.topK * 2);
    addEvent(params.traceHandle, 'custom', {
      stage: 'competitive_intent_routing',
      decision: intentDecision,
      effectiveTopK,
    });
  }

  const rounds: RetrievalRound[] = [];

  const primaryResults = await runSearchByType({
    userId: params.userId,
    collectionId: params.collectionId,
    queryText: params.query,
    queryEmbedding: params.queryEmbedding,
    searchType: effectiveSearchType,
    topK: effectiveTopK,
  });

  rounds.push({
    query: params.query,
    source: `primary:${effectiveSearchType}`,
    results: primaryResults.map((result) => ({ ...result, source: result.source ?? 'managed' })),
    weight: 1,
  });

  const expandedQueries =
    params.features.queryExpansion
      ? expandQueryVariants(params.query, params.features.aggressive).filter((variant) => variant !== params.query)
      : [];

  for (const expandedQuery of expandedQueries) {
    let expandedEmbedding = params.queryEmbedding;
    if (effectiveSearchType !== 'keyword') {
      const [embedding] = await embedder.embed([expandedQuery], 'query');
      expandedEmbedding = embedding;
    }

    const expandedResults = await runSearchByType({
      userId: params.userId,
      collectionId: params.collectionId,
      queryText: expandedQuery,
      queryEmbedding: expandedEmbedding,
      searchType: effectiveSearchType,
      topK: Math.max(4, Math.floor(effectiveTopK * 0.8)),
    });

    rounds.push({
      query: expandedQuery,
      source: `expanded:${effectiveSearchType}`,
      results: expandedResults.map((result) => ({ ...result, source: result.source ?? 'managed' })),
      weight: 0.85,
    });
  }

  if (params.options.federated) {
    const fed = await federatedRetrieve({
      userId: params.userId,
      collectionId: params.collectionId,
      queryText: params.query,
      queryEmbedding: params.queryEmbedding,
      mode: mapRAGSearchType(effectiveSearchType),
      topKPerSource: Math.min(5, effectiveTopK),
    });

    if (fed.length > 0) {
      rounds.push({
        query: params.query,
        source: 'federated',
        results: fed.map((result) => ({ ...result, source: result.source ?? 'federated' })),
        weight: 0.8,
      });
    }
  }

  let candidates =
    params.features.retrievalFusion || rounds.length > 1
      ? fuseRetrievalRounds(rounds, effectiveTopK)
      : rounds[0]?.results.slice(0, effectiveTopK) ?? [];

  candidates = dedupeByChunkId(candidates).slice(0, effectiveTopK);

  let trustGuardFiltered = 0;
  if (params.features.trustGuard && candidates.length > 0) {
    const trustGuard = applyTrustGuard(candidates, {
      blockedSources: params.options.blocked_sources,
    });
    candidates = trustGuard.accepted;
    trustGuardFiltered = trustGuard.filteredCount;
    addEvent(params.traceHandle, 'custom', {
      stage: 'competitive_trust_guard',
      filteredCount: trustGuard.filteredCount,
      keptCount: candidates.length,
      reasons: trustGuard.reasons.slice(0, 20),
    });
  }

  return {
    candidates: candidates.map((candidate) => ({
      ...candidate,
      source: candidate.source ?? 'managed',
    })),
    searchMs: Date.now() - start,
    effectiveSearchType,
    intentDecision,
    expandedQueries,
    trustGuardFiltered,
  };
}

async function runShadowEvaluation(params: {
  userId: string;
  collectionId: string;
  query: string;
  queryEmbedding: number[];
  primaryResults: VectorSearchResult[];
  primarySearchType: RAGSearchType;
  topK: number;
}): Promise<ShadowEvalResult | undefined> {
  const altMode: RAGSearchType =
    params.primarySearchType === 'keyword'
      ? 'semantic'
      : params.primarySearchType === 'semantic'
        ? 'keyword'
        : 'semantic';

  const shadowCandidates = await runSearchByType({
    userId: params.userId,
    collectionId: params.collectionId,
    queryText: params.query,
    queryEmbedding: params.queryEmbedding,
    searchType: altMode,
    topK: params.topK,
  });

  return {
    mode: altMode,
    overlapAtK: calculateOverlapAtK(params.primaryResults, shadowCandidates, Math.min(5, params.topK)),
    candidateCount: shadowCandidates.length,
  };
}

async function augmentContextWithGraph(
  query: string,
  graphId: string,
  context: { id: string; text: string }[]
): Promise<{
  context: { id: string; text: string }[];
  graphSourceCount: number;
}> {
  const supabase = createServerClient();
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 5);

  let graphRows:
    | Array<{ id: string; name: string | null; summary: string | null; level: number | null; member_count: number | null }>
    | null
    = null;

  // Query-specific fetch first.
  for (const term of queryTerms) {
    const { data, error } = await supabase
      .from('graph_communities')
      .select('id, name, summary, level, member_count')
      .eq('graph_id', graphId)
      .ilike('summary', `%${term}%`)
      .order('member_count', { ascending: false })
      .limit(2);

    if (!error && data && data.length > 0) {
      graphRows = data;
      break;
    }
  }

  if (!graphRows || graphRows.length === 0) {
    const { data, error } = await supabase
      .from('graph_communities')
      .select('id, name, summary, level, member_count')
      .eq('graph_id', graphId)
      .not('summary', 'is', null)
      .order('member_count', { ascending: false })
      .limit(2);

    if (error || !data || data.length === 0) {
      return { context, graphSourceCount: 0 };
    }

    graphRows = data;
  }

  const graphContextChunks = graphRows
    .filter((row) => typeof row.summary === 'string' && row.summary.trim().length > 0)
    .map((row) => {
      const title = row.name?.trim() || `Community ${row.id.slice(0, 8)}`;
      const level = typeof row.level === 'number' ? row.level : null;
      const memberCount = typeof row.member_count === 'number' ? row.member_count : null;
      const header = `Graph Context: ${title}`;
      const meta = [
        level !== null ? `level=${level}` : null,
        memberCount !== null ? `members=${memberCount}` : null,
      ].filter(Boolean).join(', ');

      return {
        id: `graph:${row.id}`,
        text: `${header}${meta ? ` (${meta})` : ''}\n${row.summary}`,
      };
    });

  if (graphContextChunks.length === 0) {
    return { context, graphSourceCount: 0 };
  }

  return {
    context: [...graphContextChunks, ...context],
    graphSourceCount: graphContextChunks.length,
  };
}

// ===========================================
// Main RAG Pipeline
// ===========================================

export async function ragQuery(params: RAGParams): Promise<RAGResponse> {
  const requestId = randomUUID();
  const traceId = randomUUID();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const options = params.options ?? {};
  const canaryAssignment = getActiveAssignment(params.userId, {
    collectionId: params.collectionId,
    apiKeyId: params.apiKeyId,
  });
  const canaryConfig =
    canaryAssignment?.assignedVersion === 'canary' &&
    canaryAssignment.version?.config &&
    typeof canaryAssignment.version.config === 'object'
      ? (canaryAssignment.version.config as Record<string, unknown>)
      : null;
  const canaryPhaseOverride =
    canaryConfig && typeof canaryConfig.competitive_phase === 'number'
      ? canaryConfig.competitive_phase
      : undefined;
  const competitiveFeatures = resolveCompetitiveFeatures({
    phaseOverride: options.competitive_phase ?? canaryPhaseOverride,
    aggressive: options.competitive_aggressive,
    queryExpansion: options.query_expansion,
    lateInteraction: options.late_interaction,
    intentRouting: options.intent_routing,
    graphAugmentation: options.graph_augmentation,
    trustGuard: options.trust_guard,
    shadowEval: options.shadow_eval,
  });

  // Start Flight Recorder trace
  const traceHandle = await startTrace({
    requestId,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    plan: params.plan,
    collectionId: params.collectionId,
    queryText: params.query,
    autopilotEnabled: true,
    source: 'api',
  });

  try {
    // 1. Budget-aware planning
    const budgetPlan = planWithBudget({
      plan: params.plan,
      requestedOptions: options,
      estimatedQueryTokens: estimateTokens(params.query),
    });

    addEvent(traceHandle, 'custom', {
      stage: 'budget_planning',
      plan: budgetPlan,
      competitive: competitiveFeatures,
    });

    // 2. Embed query
    const embedSpan = startSpan(traceHandle, 'embedding', { queryLength: params.query.length });
    const embedder = getEmbeddingProvider();
    const embedStart = Date.now();
    const [queryEmbedding] = await embedder.embed([params.query], 'query');
    const embedMs = Date.now() - embedStart;
    endSpan(traceHandle, embedSpan, { dimensions: queryEmbedding.length, latencyMs: embedMs });

    // 3. Search candidates (competitive-aware)
    const searchSpan = startSpan(traceHandle, 'vector_search', {
      type: budgetPlan.searchType,
      topK: budgetPlan.topK,
      competitivePhase: competitiveFeatures.phase,
    });
    const searchExecution = await executeCompetitiveSearch({
      userId: params.userId,
      collectionId: params.collectionId,
      query: params.query,
      queryEmbedding,
      topK: budgetPlan.topK,
      defaultSearchType: budgetPlan.searchType,
      options,
      features: competitiveFeatures,
      traceHandle,
    });
    const searchMs = searchExecution.searchMs;
    const candidates = searchExecution.candidates;
    endSpan(traceHandle, searchSpan, { candidateCount: candidates.length, latencyMs: searchMs });
    addEvent(traceHandle, 'custom', {
      stage: 'competitive_retrieval',
      effectiveSearchType: searchExecution.effectiveSearchType,
      expandedQueries: searchExecution.expandedQueries,
      trustGuardFiltered: searchExecution.trustGuardFiltered,
      intentDecision: searchExecution.intentDecision,
      candidateCount: candidates.length,
    });

    // 4. Rerank (if enabled)
    let rerankMs = 0;
    let finalResults = candidates.slice(0, budgetPlan.topK);

    if (budgetPlan.rerankEnabled && candidates.length > 0) {
      const rerankSpan = startSpan(traceHandle, 'rerank', { candidateCount: candidates.length });
      const reranker = getRerankProvider();
      const docs = candidates.slice(0, budgetPlan.rerankTopN).map((r) => ({
        id: r.chunkId,
        text: r.text,
        metadata: { documentId: r.documentId, ...r.metadata },
      }));

      const rerankStart = Date.now();
      const reranked = await reranker.rerank(params.query, docs, { topN: budgetPlan.rerankTopN });
      rerankMs = Date.now() - rerankStart;

      const idToCandidate = new Map(candidates.map((c) => [c.chunkId, c] as const));
      const rerankedCandidates = reranked
        .map((r) => idToCandidate.get(r.id))
        .filter(Boolean) as VectorSearchResult[];

      finalResults = rerankedCandidates.slice(0, budgetPlan.topK);
      endSpan(traceHandle, rerankSpan, { rerankedCount: reranked.length, latencyMs: rerankMs });
    }

    // 5. Build context
    const contextSpan = startSpan(traceHandle, 'custom', { operation: 'context_build' });
    const contextStart = Date.now();
    const planConfig = getPlan(params.plan);
    const maxContextTokens = Math.min(planConfig.maxInputTokens, 16000);
    let context = buildContext(finalResults, maxContextTokens);
    let graphSourceCount = 0;

    if (competitiveFeatures.graphAugmentation && options.graph_id) {
      try {
        const graphAugmentation = await augmentContextWithGraph(params.query, options.graph_id, context);
        context = graphAugmentation.context;
        graphSourceCount = graphAugmentation.graphSourceCount;

        addEvent(traceHandle, 'custom', {
          stage: 'competitive_graph_augmentation',
          graphId: options.graph_id,
          graphSourceCount,
        });
      } catch (graphError) {
        addEvent(traceHandle, 'custom', {
          stage: 'competitive_graph_augmentation_failed',
          graphId: options.graph_id,
          error: graphError instanceof Error ? graphError.message : String(graphError),
        });
      }
    }

    const contextMs = Date.now() - contextStart;

    addContextEvent(traceHandle, context.map((c) => ({ id: c.id, text: c.text })));
    endSpan(traceHandle, contextSpan, { chunkCount: context.length, latencyMs: contextMs });

    // 6. Generate LLM response
    const llmSpan = startSpan(traceHandle, 'llm_generation', {
      model: budgetPlan.llmModel,
      maxTokens: budgetPlan.maxTokens,
    });
    const llmStart = Date.now();

    const systemPrompt = options.system_prompt ?? buildAnswerContractSystemPrompt();
    const userPrompt = buildAnswerContractUserPrompt({ question: params.query, context });
    const temperature = options.temperature ?? 0.3;

    const modelConfig = MODEL_MAP[budgetPlan.llmModel];
    let llmResult: { text: string; inputTokens: number; outputTokens: number };

    if (modelConfig.provider === 'anthropic') {
      llmResult = await callAnthropicLLM({
        modelId: modelConfig.modelId,
        systemPrompt,
        userPrompt,
        maxTokens: budgetPlan.maxTokens,
        temperature,
      });
    } else {
      llmResult = await callOpenAILLM({
        modelId: modelConfig.modelId,
        systemPrompt,
        userPrompt,
        maxTokens: budgetPlan.maxTokens,
        temperature,
      });
    }

    const llmMs = Date.now() - llmStart;
    endSpan(traceHandle, llmSpan, {
      inputTokens: llmResult.inputTokens,
      outputTokens: llmResult.outputTokens,
      latencyMs: llmMs,
    });

    addEvent(traceHandle, 'llm', {
      provider: modelConfig.provider,
      model: modelConfig.modelId,
      inputTokens: llmResult.inputTokens,
      outputTokens: llmResult.outputTokens,
      latencyMs: llmMs,
    });

    // 7. Optional shadow evaluation
    let shadowEvalResult: ShadowEvalResult | undefined;
    if (competitiveFeatures.shadowEval && finalResults.length > 0) {
      try {
        shadowEvalResult = await runShadowEvaluation({
          userId: params.userId,
          collectionId: params.collectionId,
          query: params.query,
          queryEmbedding,
          primaryResults: finalResults,
          primarySearchType: searchExecution.effectiveSearchType,
          topK: budgetPlan.topK,
        });

        addEvent(traceHandle, 'custom', {
          stage: 'competitive_shadow_eval',
          result: shadowEvalResult,
        });
      } catch (shadowError) {
        addEvent(traceHandle, 'custom', {
          stage: 'competitive_shadow_eval_failed',
          error: shadowError instanceof Error ? shadowError.message : String(shadowError),
        });
      }
    }

    // 8. Emit online learning signal
    if (competitiveFeatures.onlineLearning) {
      addEvent(traceHandle, 'custom', {
        stage: 'competitive_online_learning_signal',
        topScore: getTopScore(finalResults),
        sourceDiversity: new Set(finalResults.map((result) => result.source || 'managed')).size,
        candidateCount: finalResults.length,
      });
    }

    // 9. Calculate usage and cost
    const embeddingTokens = estimateTokens(params.query);
    const vectorSearchOps = 1 + searchExecution.expandedQueries.length + (options.federated ? 1 : 0);
    const cost = calculateTraceCost({
      embeddingTokens,
      vectorSearchOps,
      rerankItems: budgetPlan.rerankEnabled ? finalResults.length : 0,
      llmInputTokens: llmResult.inputTokens,
      llmOutputTokens: llmResult.outputTokens,
    });

    const totalMs = Date.now() - t0;

    const usage: RAGUsage = {
      embedding_tokens: embeddingTokens,
      llm_input_tokens: llmResult.inputTokens,
      llm_output_tokens: llmResult.outputTokens,
      total_cost_credits: Math.round(cost.total * 10000) / 10000,
    };

    const sources = buildSources(finalResults);

    // Finish trace
    await finishTrace(traceHandle, {
      timingsMs: {
        embedding: embedMs,
        vectorSearch: searchMs,
        rerank: rerankMs,
        llm: llmMs,
        total: totalMs,
      },
      resultsCount: finalResults.length,
      cost,
    });

    const topQualityScore = Math.min(Math.max(getTopScore(finalResults), 0), 1);
    if (canaryAssignment) {
      try {
        recordRequestResult({
          deploymentId: canaryAssignment.deploymentId,
          version: canaryAssignment.assignedVersion,
          success: true,
          latencyMs: totalMs,
          qualityScore: topQualityScore,
        });
      } catch (canaryMetricError) {
        addEvent(traceHandle, 'custom', {
          stage: 'canary_metric_record_failed',
          error: canaryMetricError instanceof Error ? canaryMetricError.message : String(canaryMetricError),
        });
      }
    }

    const response: RAGResponse = {
      answer: llmResult.text,
      sources,
      usage,
      latency_ms: totalMs,
      trace_id: traceId,
      competitive: {
        phase: competitiveFeatures.phase,
        aggressive: competitiveFeatures.aggressive,
        search_type: searchExecution.effectiveSearchType,
        canary: canaryAssignment
          ? {
              deployment_id: canaryAssignment.deploymentId,
              assigned_version: canaryAssignment.assignedVersion,
            }
          : undefined,
        shadow_eval: shadowEvalResult
          ? {
              mode: shadowEvalResult.mode,
              overlap_at_k: shadowEvalResult.overlapAtK,
              candidate_count: shadowEvalResult.candidateCount,
            }
          : undefined,
      },
    };

    if (options.include_trace) {
      response.trace = {
        trace_id: traceId,
        request_id: requestId,
        started_at: startedAt,
        timings_ms: {
          search: searchMs,
          rerank: budgetPlan.rerankEnabled ? rerankMs : undefined,
          context_build: contextMs,
          llm: llmMs,
          total: totalMs,
        },
        config: {
          search_type: searchExecution.effectiveSearchType,
          top_k: budgetPlan.topK,
          rerank_enabled: budgetPlan.rerankEnabled,
          llm_model: budgetPlan.llmModel,
        },
        budget_info: budgetPlan.degraded
          ? { degraded: true, reason: budgetPlan.degradeReason }
          : undefined,
        competitive: {
          phase: competitiveFeatures.phase,
          aggressive: competitiveFeatures.aggressive,
          intent: searchExecution.intentDecision,
          expanded_queries: searchExecution.expandedQueries,
          trust_guard_filtered: searchExecution.trustGuardFiltered,
          shadow_eval: shadowEvalResult
            ? {
                mode: shadowEvalResult.mode,
                overlap_at_k: shadowEvalResult.overlapAtK,
                candidate_count: shadowEvalResult.candidateCount,
              }
            : undefined,
          graph_augmentation:
            graphSourceCount > 0 && options.graph_id
              ? {
                  graph_id: options.graph_id,
                  source_count: graphSourceCount,
                }
              : undefined,
        },
      };
    }

    return response;
  } catch (error) {
    addEvent(traceHandle, 'error', {
      message: error instanceof Error ? error.message : String(error),
    });

    if (canaryAssignment) {
      try {
        recordRequestResult({
          deploymentId: canaryAssignment.deploymentId,
          version: canaryAssignment.assignedVersion,
          success: false,
          latencyMs: Date.now() - t0,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (canaryMetricError) {
        addEvent(traceHandle, 'custom', {
          stage: 'canary_metric_record_failed',
          error: canaryMetricError instanceof Error ? canaryMetricError.message : String(canaryMetricError),
        });
      }
    }

    await finishTrace(traceHandle, {
      error: error instanceof Error ? error.message : String(error),
      timingsMs: { total: Date.now() - t0 },
      resultsCount: 0,
    });

    throw error;
  }
}

// ===========================================
// Streaming RAG Pipeline
// ===========================================

export async function* ragQueryStream(params: RAGParams): AsyncGenerator<RAGStreamChunk> {
  const requestId = randomUUID();
  const traceId = randomUUID();
  const t0 = Date.now();
  const options = params.options ?? {};
  const canaryAssignment = getActiveAssignment(params.userId, {
    collectionId: params.collectionId,
    apiKeyId: params.apiKeyId,
  });
  const canaryConfig =
    canaryAssignment?.assignedVersion === 'canary' &&
    canaryAssignment.version?.config &&
    typeof canaryAssignment.version.config === 'object'
      ? (canaryAssignment.version.config as Record<string, unknown>)
      : null;
  const canaryPhaseOverride =
    canaryConfig && typeof canaryConfig.competitive_phase === 'number'
      ? canaryConfig.competitive_phase
      : undefined;
  const competitiveFeatures = resolveCompetitiveFeatures({
    phaseOverride: options.competitive_phase ?? canaryPhaseOverride,
    aggressive: options.competitive_aggressive,
    queryExpansion: options.query_expansion,
    lateInteraction: options.late_interaction,
    intentRouting: options.intent_routing,
    graphAugmentation: options.graph_augmentation,
    trustGuard: options.trust_guard,
    shadowEval: options.shadow_eval,
  });

  // Start Flight Recorder trace
  const traceHandle = await startTrace({
    requestId,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    plan: params.plan,
    collectionId: params.collectionId,
    queryText: params.query,
    autopilotEnabled: true,
    source: 'api',
  });

  try {
    // 1. Budget-aware planning
    const budgetPlan = planWithBudget({
      plan: params.plan,
      requestedOptions: options,
      estimatedQueryTokens: estimateTokens(params.query),
    });

    // 2. Embed query
    const embedder = getEmbeddingProvider();
    const embedStart = Date.now();
    const [queryEmbedding] = await embedder.embed([params.query], 'query');
    const embedMs = Date.now() - embedStart;

    // 3. Search candidates (competitive-aware)
    const searchExecution = await executeCompetitiveSearch({
      userId: params.userId,
      collectionId: params.collectionId,
      query: params.query,
      queryEmbedding,
      topK: budgetPlan.topK,
      defaultSearchType: budgetPlan.searchType,
      options,
      features: competitiveFeatures,
      traceHandle,
    });
    const searchMs = searchExecution.searchMs;
    const candidates = searchExecution.candidates;

    // 4. Rerank (if enabled)
    let rerankMs = 0;
    let finalResults = candidates.slice(0, budgetPlan.topK);

    if (budgetPlan.rerankEnabled && candidates.length > 0) {
      const reranker = getRerankProvider();
      const docs = candidates.slice(0, budgetPlan.rerankTopN).map((r) => ({
        id: r.chunkId,
        text: r.text,
        metadata: { documentId: r.documentId, ...r.metadata },
      }));

      const rerankStart = Date.now();
      const reranked = await reranker.rerank(params.query, docs, { topN: budgetPlan.rerankTopN });
      rerankMs = Date.now() - rerankStart;

      const idToCandidate = new Map(candidates.map((c) => [c.chunkId, c] as const));
      const rerankedCandidates = reranked
        .map((r) => idToCandidate.get(r.id))
        .filter(Boolean) as VectorSearchResult[];

      finalResults = rerankedCandidates.slice(0, budgetPlan.topK);
    }

    // 5. Build context
    const planConfig = getPlan(params.plan);
    const maxContextTokens = Math.min(planConfig.maxInputTokens, 16000);
    let context = buildContext(finalResults, maxContextTokens);
    let graphSourceCount = 0;

    if (competitiveFeatures.graphAugmentation && options.graph_id) {
      try {
        const graphAugmentation = await augmentContextWithGraph(params.query, options.graph_id, context);
        context = graphAugmentation.context;
        graphSourceCount = graphAugmentation.graphSourceCount;
      } catch (graphError) {
        addEvent(traceHandle, 'custom', {
          stage: 'competitive_graph_augmentation_failed',
          error: graphError instanceof Error ? graphError.message : String(graphError),
        });
      }
    }

    addContextEvent(traceHandle, context.map((c) => ({ id: c.id, text: c.text })));

    // 6. Stream LLM response
    const llmStart = Date.now();
    const systemPrompt = options.system_prompt ?? buildAnswerContractSystemPrompt();
    const userPrompt = buildAnswerContractUserPrompt({ question: params.query, context });
    const temperature = options.temperature ?? 0.3;

    const modelConfig = MODEL_MAP[budgetPlan.llmModel];
    let inputTokens = 0;
    let outputTokens = 0;

    const llmStream =
      modelConfig.provider === 'anthropic'
        ? streamAnthropicLLM({
            modelId: modelConfig.modelId,
            systemPrompt,
            userPrompt,
            maxTokens: budgetPlan.maxTokens,
            temperature,
          })
        : streamOpenAILLM({
            modelId: modelConfig.modelId,
            systemPrompt,
            userPrompt,
            maxTokens: budgetPlan.maxTokens,
            temperature,
          });

    for await (const chunk of llmStream) {
      if (chunk.type === 'content' && chunk.content) {
        yield { type: 'content', content: chunk.content };
      } else if (chunk.type === 'usage') {
        inputTokens = chunk.inputTokens ?? 0;
        outputTokens = chunk.outputTokens ?? 0;
      }
    }

    const llmMs = Date.now() - llmStart;
    const totalMs = Date.now() - t0;

    // 7. Optional shadow evaluation
    let shadowEvalResult: ShadowEvalResult | undefined;
    if (competitiveFeatures.shadowEval && finalResults.length > 0) {
      try {
        shadowEvalResult = await runShadowEvaluation({
          userId: params.userId,
          collectionId: params.collectionId,
          query: params.query,
          queryEmbedding,
          primaryResults: finalResults,
          primarySearchType: searchExecution.effectiveSearchType,
          topK: budgetPlan.topK,
        });
      } catch (shadowError) {
        addEvent(traceHandle, 'custom', {
          stage: 'competitive_shadow_eval_failed',
          error: shadowError instanceof Error ? shadowError.message : String(shadowError),
        });
      }
    }

    // 8. Send sources
    const sources = buildSources(finalResults);
    yield { type: 'sources', sources };

    // 9. Send usage
    const embeddingTokens = estimateTokens(params.query);
    const vectorSearchOps = 1 + searchExecution.expandedQueries.length + (options.federated ? 1 : 0);
    const usage: RAGUsage = {
      embedding_tokens: embeddingTokens,
      llm_input_tokens: inputTokens,
      llm_output_tokens: outputTokens,
      total_cost_credits: Math.round(
        calculateTraceCost({
          embeddingTokens,
          vectorSearchOps,
          rerankItems: budgetPlan.rerankEnabled ? finalResults.length : 0,
          llmInputTokens: inputTokens,
          llmOutputTokens: outputTokens,
        }).total * 10000
      ) / 10000,
    };

    yield {
      type: 'usage',
      usage,
      latency_ms: totalMs,
      trace_id: traceId,
      competitive: {
        phase: competitiveFeatures.phase,
        aggressive: competitiveFeatures.aggressive,
        search_type: searchExecution.effectiveSearchType,
        canary: canaryAssignment
          ? {
              deployment_id: canaryAssignment.deploymentId,
              assigned_version: canaryAssignment.assignedVersion,
            }
          : undefined,
        shadow_eval: shadowEvalResult
          ? {
              mode: shadowEvalResult.mode,
              overlap_at_k: shadowEvalResult.overlapAtK,
              candidate_count: shadowEvalResult.candidateCount,
            }
          : undefined,
      },
    };
    yield { type: 'done' };

    // Finish trace
    addEvent(traceHandle, 'llm', {
      provider: modelConfig.provider,
      model: modelConfig.modelId,
      inputTokens,
      outputTokens,
      latencyMs: llmMs,
      streamed: true,
    });
    addEvent(traceHandle, 'custom', {
      stage: 'competitive_streaming_summary',
      phase: competitiveFeatures.phase,
      effectiveSearchType: searchExecution.effectiveSearchType,
      expandedQueries: searchExecution.expandedQueries,
      trustGuardFiltered: searchExecution.trustGuardFiltered,
      graphSourceCount,
      shadowEval: shadowEvalResult,
    });

    await finishTrace(traceHandle, {
      timingsMs: {
        embedding: embedMs,
        vectorSearch: searchMs,
        rerank: rerankMs,
        llm: llmMs,
        total: totalMs,
      },
      resultsCount: finalResults.length,
    });

    if (canaryAssignment) {
      try {
        recordRequestResult({
          deploymentId: canaryAssignment.deploymentId,
          version: canaryAssignment.assignedVersion,
          success: true,
          latencyMs: totalMs,
          qualityScore: Math.min(Math.max(getTopScore(finalResults), 0), 1),
        });
      } catch (canaryMetricError) {
        addEvent(traceHandle, 'custom', {
          stage: 'canary_metric_record_failed',
          error: canaryMetricError instanceof Error ? canaryMetricError.message : String(canaryMetricError),
        });
      }
    }
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };

    addEvent(traceHandle, 'error', {
      message: error instanceof Error ? error.message : String(error),
    });

    if (canaryAssignment) {
      try {
        recordRequestResult({
          deploymentId: canaryAssignment.deploymentId,
          version: canaryAssignment.assignedVersion,
          success: false,
          latencyMs: Date.now() - t0,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (canaryMetricError) {
        addEvent(traceHandle, 'custom', {
          stage: 'canary_metric_record_failed',
          error: canaryMetricError instanceof Error ? canaryMetricError.message : String(canaryMetricError),
        });
      }
    }

    await finishTrace(traceHandle, {
      error: error instanceof Error ? error.message : String(error),
      timingsMs: { total: Date.now() - t0 },
      resultsCount: 0,
    });
  }
}

// ===========================================
// Exports
// ===========================================

export type {
  TraceHandle,
  TraceCost,
};
