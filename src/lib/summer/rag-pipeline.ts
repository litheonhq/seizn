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
import type { VectorSearchResult, RetrievalConfig } from './types';
import { getEmbeddingProvider } from './embedding';
import { getRerankProvider } from './rerank';
import { getVectorStore } from './vectorstore';
import { planRetrieval } from './autopilot/planner';
import { federatedRetrieve } from './federated/search';
import { buildAnswerContractSystemPrompt, buildAnswerContractUserPrompt } from './answer-contract/prompt';
import { estimateTokens } from './utils/tokens';

import { getPlan, hasFeature } from '@/lib/plan-limits';
import { resolveBudget, applyBudgetLimits, estimateCost } from '@/lib/core/primitives/budget';
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
}

export interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  usage: RAGUsage;
  latency_ms: number;
  trace_id: string;
  trace?: RAGTrace;
}

export interface RAGStreamChunk {
  type: 'content' | 'sources' | 'usage' | 'done' | 'error';
  content?: string;
  sources?: RAGSource[];
  usage?: RAGUsage;
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
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
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
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
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

// ===========================================
// Main RAG Pipeline
// ===========================================

export async function ragQuery(params: RAGParams): Promise<RAGResponse> {
  const requestId = randomUUID();
  const traceId = randomUUID();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const options = params.options ?? {};

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
    });

    // 2. Embed query
    const embedSpan = startSpan(traceHandle, 'embedding', { queryLength: params.query.length });
    const embedder = getEmbeddingProvider();
    const embedStart = Date.now();
    const [queryEmbedding] = await embedder.embed([params.query], 'query');
    const embedMs = Date.now() - embedStart;
    endSpan(traceHandle, embedSpan, { dimensions: queryEmbedding.length, latencyMs: embedMs });

    // 3. Search candidates
    const searchSpan = startSpan(traceHandle, 'vector_search', {
      type: budgetPlan.searchType,
      topK: budgetPlan.topK,
    });
    const searchStart = Date.now();
    const store = getVectorStore();

    let candidates: VectorSearchResult[] = [];
    const searchMode = mapRAGSearchType(budgetPlan.searchType);

    if (searchMode === 'vector') {
      candidates = await store.search({
        userId: params.userId,
        collectionId: params.collectionId,
        queryEmbedding,
        topK: budgetPlan.topK,
        threshold: 0.5,
      });
    } else if (searchMode === 'keyword') {
      candidates = await store.keywordSearch({
        userId: params.userId,
        collectionId: params.collectionId,
        queryText: params.query,
        topK: budgetPlan.topK,
      });
    } else {
      candidates = await store.hybridSearch({
        userId: params.userId,
        collectionId: params.collectionId,
        queryText: params.query,
        queryEmbedding,
        topK: budgetPlan.topK,
        threshold: 0.5,
        keywordWeight: 0.3,
        vectorWeight: 0.7,
      });
    }

    candidates = candidates.map((c) => ({ ...c, source: c.source ?? 'managed' }));
    const searchMs = Date.now() - searchStart;
    endSpan(traceHandle, searchSpan, { candidateCount: candidates.length, latencyMs: searchMs });

    // 4. Federated search (optional)
    if (options.federated) {
      const fedSpan = startSpan(traceHandle, 'custom', { operation: 'federated_search' });
      const fedStart = Date.now();
      const fed = await federatedRetrieve({
        userId: params.userId,
        collectionId: params.collectionId,
        queryText: params.query,
        queryEmbedding,
        mode: searchMode,
        topKPerSource: Math.min(5, budgetPlan.topK),
      });
      const fedMs = Date.now() - fedStart;
      candidates = dedupeByChunkId([...candidates, ...fed]);
      endSpan(traceHandle, fedSpan, { federatedCount: fed.length, latencyMs: fedMs });
    }

    // 5. Rerank (if enabled)
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

    // 6. Build context
    const contextSpan = startSpan(traceHandle, 'custom', { operation: 'context_build' });
    const contextStart = Date.now();
    const planConfig = getPlan(params.plan);
    const maxContextTokens = Math.min(planConfig.maxInputTokens, 16000);
    const context = buildContext(finalResults, maxContextTokens);
    const contextMs = Date.now() - contextStart;

    addContextEvent(traceHandle, context.map((c) => ({ id: c.id, text: c.text })));
    endSpan(traceHandle, contextSpan, { chunkCount: context.length, latencyMs: contextMs });

    // 7. Generate LLM response
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

    // 8. Calculate usage and cost
    const embeddingTokens = estimateTokens(params.query);
    const cost = calculateTraceCost({
      embeddingTokens,
      vectorSearchOps: 1,
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

    const response: RAGResponse = {
      answer: llmResult.text,
      sources,
      usage,
      latency_ms: totalMs,
      trace_id: traceId,
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
          search_type: budgetPlan.searchType,
          top_k: budgetPlan.topK,
          rerank_enabled: budgetPlan.rerankEnabled,
          llm_model: budgetPlan.llmModel,
        },
        budget_info: budgetPlan.degraded
          ? { degraded: true, reason: budgetPlan.degradeReason }
          : undefined,
      };
    }

    return response;
  } catch (error) {
    addEvent(traceHandle, 'error', {
      message: error instanceof Error ? error.message : String(error),
    });

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
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const options = params.options ?? {};

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

    // 3. Search candidates
    const searchStart = Date.now();
    const store = getVectorStore();
    let candidates: VectorSearchResult[] = [];
    const searchMode = mapRAGSearchType(budgetPlan.searchType);

    if (searchMode === 'vector') {
      candidates = await store.search({
        userId: params.userId,
        collectionId: params.collectionId,
        queryEmbedding,
        topK: budgetPlan.topK,
        threshold: 0.5,
      });
    } else if (searchMode === 'keyword') {
      candidates = await store.keywordSearch({
        userId: params.userId,
        collectionId: params.collectionId,
        queryText: params.query,
        topK: budgetPlan.topK,
      });
    } else {
      candidates = await store.hybridSearch({
        userId: params.userId,
        collectionId: params.collectionId,
        queryText: params.query,
        queryEmbedding,
        topK: budgetPlan.topK,
        threshold: 0.5,
        keywordWeight: 0.3,
        vectorWeight: 0.7,
      });
    }

    candidates = candidates.map((c) => ({ ...c, source: c.source ?? 'managed' }));
    const searchMs = Date.now() - searchStart;

    // 4. Federated search (optional)
    if (options.federated) {
      const fed = await federatedRetrieve({
        userId: params.userId,
        collectionId: params.collectionId,
        queryText: params.query,
        queryEmbedding,
        mode: searchMode,
        topKPerSource: Math.min(5, budgetPlan.topK),
      });
      candidates = dedupeByChunkId([...candidates, ...fed]);
    }

    // 5. Rerank (if enabled)
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

    // 6. Build context
    const planConfig = getPlan(params.plan);
    const maxContextTokens = Math.min(planConfig.maxInputTokens, 16000);
    const context = buildContext(finalResults, maxContextTokens);

    addContextEvent(traceHandle, context.map((c) => ({ id: c.id, text: c.text })));

    // 7. Stream LLM response
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

    // 8. Send sources
    const sources = buildSources(finalResults);
    yield { type: 'sources', sources };

    // 9. Send usage
    const embeddingTokens = estimateTokens(params.query);
    const usage: RAGUsage = {
      embedding_tokens: embeddingTokens,
      llm_input_tokens: inputTokens,
      llm_output_tokens: outputTokens,
      total_cost_credits: Math.round(
        calculateTraceCost({
          embeddingTokens,
          vectorSearchOps: 1,
          rerankItems: budgetPlan.rerankEnabled ? finalResults.length : 0,
          llmInputTokens: inputTokens,
          llmOutputTokens: outputTokens,
        }).total * 10000
      ) / 10000,
    };

    yield { type: 'usage', usage, latency_ms: totalMs, trace_id: traceId };
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
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };

    addEvent(traceHandle, 'error', {
      message: error instanceof Error ? error.message : String(error),
    });

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
