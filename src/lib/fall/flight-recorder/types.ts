import type { PiiMaskingConfig } from './pii-safe';
import type { SamplingConfig, SamplingReason } from './sampling';

// ============================================
// Core Event Types
// ============================================

export type RetrievalEventType =
  | 'embed'
  | 'candidates'
  | 'rerank'
  | 'context'
  | 'compression'
  | 'answer_contract'
  | 'feedback'
  | 'error'
  | 'llm'
  | 'cache_hit'
  | 'custom';

export interface RetrievalEvent {
  type: RetrievalEventType;
  ts: string; // ISO
  payload: Record<string, unknown>;
  /** Whether PII was detected and masked in this event */
  piiMasked?: boolean;
  /** Duration of this event in milliseconds */
  durationMs?: number;
}

// ============================================
// Span Types for Pipeline Stages
// ============================================

export type SpanName =
  | 'embedding'
  | 'vector_search'
  | 'keyword_search'
  | 'rerank'
  | 'llm_generation'
  | 'postprocess'
  | 'cache_lookup'
  | 'custom';

export interface Span {
  /** Unique span name */
  name: SpanName | string;
  /** Start timestamp (ISO) */
  startedAt: string;
  /** End timestamp (ISO) */
  endedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Input data for this span */
  input?: Record<string, unknown>;
  /** Output data for this span */
  output?: Record<string, unknown>;
  /** Status of the span */
  status: 'running' | 'success' | 'error';
  /** Error message if status is error */
  error?: string;
  /** Nested child spans */
  children?: Span[];
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// Configuration Snapshot
// ============================================

export interface TraceConfig {
  /** Search type: semantic, keyword, hybrid */
  searchType?: 'semantic' | 'keyword' | 'hybrid';
  /** Embedding model used */
  embeddingModel?: string;
  /** Embedding dimensions */
  embeddingDimensions?: number;
  /** Hybrid search alpha (semantic weight) */
  hybridAlpha?: number;
  /** Number of candidates to retrieve */
  topK?: number;
  /** Whether reranking is enabled */
  rerankEnabled?: boolean;
  /** Rerank model used */
  rerankModel?: string;
  /** Rerank top N */
  rerankTopN?: number;
  /** LLM model for generation */
  llmModel?: string;
  /** LLM temperature */
  llmTemperature?: number;
  /** LLM max tokens */
  llmMaxTokens?: number;
  /** Custom config fields */
  custom?: Record<string, unknown>;
}

// ============================================
// Cost Estimation
// ============================================

export interface TraceCost {
  /** Embedding cost in USD */
  embedding?: number;
  /** Vector search cost in USD */
  vectorSearch?: number;
  /** Rerank cost in USD */
  rerank?: number;
  /** LLM generation cost in USD */
  llm?: number;
  /** Total cost in USD */
  total: number;
  /** Token counts */
  tokens?: {
    embeddingInput?: number;
    llmInput?: number;
    llmOutput?: number;
  };
}

// ============================================
// Result Statistics
// ============================================

export interface ResultStats {
  /** Number of results returned */
  count: number;
  /** Score distribution */
  scores?: {
    min: number;
    max: number;
    avg: number;
    distribution?: number[];
  };
  /** Unique document IDs */
  documentIds?: string[];
  /** Rerank score changes */
  rerankDeltas?: Array<{
    id: string;
    originalScore: number;
    rerankScore: number;
    delta: number;
  }>;
}

// ============================================
// Enhanced Trace Types
// ============================================

export interface TraceStartParams {
  requestId: string;
  userId: string;
  apiKeyId?: string;
  plan: string;
  collectionId?: string;
  collectionIds?: string[];
  queryText?: string;
  autopilotEnabled?: boolean;
  /** Initial configuration */
  config?: Partial<TraceConfig>;
  /** Source of the request */
  source?: 'api' | 'sdk' | 'dashboard' | 'playground';
  /** Client version */
  clientVersion?: string;
}

export interface TraceSummary {
  autopilotReason?: string;
  effectiveConfig?: Record<string, unknown>;
  timingsMs?: Record<string, number>;
  resultsCount?: number;
  error?: string;
  experimentId?: string;
  armId?: string;
  /** Chunk texts for context event (will be PII-masked if configured) */
  chunkTexts?: string[];
  /** Result statistics */
  resultStats?: ResultStats;
  /** Cost breakdown */
  cost?: TraceCost;
  /** Answer contract results */
  answerContract?: {
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message?: string;
    }>;
  };
}

export interface TraceHandle {
  traceId: string;
  requestId: string;
  startedAtMs: number;
  sampled: boolean;
  events: RetrievalEvent[];
  base: TraceStartParams;
  /** Pipeline spans */
  spans: Span[];
  /** Current active span */
  activeSpan?: Span;
  /** Sampling decision metadata */
  samplingInfo?: {
    rate: number;
    reason: SamplingReason;
  };
}

// ============================================
// Stored Trace (Database Record)
// ============================================

export interface StoredTrace {
  id: string;
  requestId: string;
  userId: string;
  apiKeyId?: string;
  plan: string;
  collectionId?: string;
  collectionIds?: string[];
  queryText?: string;
  queryHash?: string;
  autopilotReason?: string;
  effectiveConfig: TraceConfig;
  timingsMs: Record<string, number>;
  resultsCount: number;
  error?: string;
  sampled: boolean;
  experimentId?: string;
  armId?: string;
  /** Full trace data */
  trace: {
    traceId: string;
    startedAt: string;
    endedAt?: string;
    totalDurationMs?: number;
    autopilot: {
      enabled: boolean;
      reason?: string;
    };
    config: TraceConfig;
    spans: Span[];
    events: RetrievalEvent[];
    resultStats?: ResultStats;
    cost?: TraceCost;
  };
  createdAt: string;
  /** Replay reference */
  replayOf?: string;
}

// ============================================
// Trace List & Query Types
// ============================================

export interface TraceListParams {
  userId: string;
  /** Filter by collection */
  collectionId?: string;
  /** Filter by time range */
  startDate?: Date;
  endDate?: Date;
  /** Filter by error presence */
  hasError?: boolean;
  /** Filter by minimum latency */
  minLatencyMs?: number;
  /** Filter by experiment */
  experimentId?: string;
  /** Search query text (partial match) */
  searchQuery?: string;
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Sort order */
  orderBy?: 'created_at' | 'latency' | 'cost';
  orderDirection?: 'asc' | 'desc';
}

export interface TraceListResult {
  traces: StoredTrace[];
  total: number;
  hasMore: boolean;
}

// ============================================
// Comparison Types
// ============================================

export interface TraceComparisonResult {
  results: {
    overlapCount: number;
    overlapPercent: number;
    onlyInA: string[];
    onlyInB: string[];
    rankingChanges: Array<{
      id: string;
      rankA: number;
      rankB: number;
      delta: number;
    }>;
  };
  latency: {
    embedding: { a: number; b: number; delta: number; deltaPercent: number };
    search: { a: number; b: number; delta: number; deltaPercent: number };
    rerank: { a: number; b: number; delta: number };
    total: { a: number; b: number; delta: number; deltaPercent: number };
  };
  cost: {
    a: number;
    b: number;
    delta: number;
    deltaPercent: number;
  };
  config: Record<string, { a: unknown; b: unknown; changed: boolean }>;
  summary: {
    resultsImproved: number;
    resultsDegraded: number;
    latencyImproved: boolean;
    costImproved: boolean;
  };
}

// ============================================
// Configuration
// ============================================

/**
 * Configuration for the Flight Recorder
 */
export interface FlightRecorderConfig {
  /** PII masking configuration */
  piiMasking?: Partial<PiiMaskingConfig>;
  /** Sampling configuration */
  sampling?: Partial<SamplingConfig>;
  /** Enable debug logging */
  debug?: boolean;
  /** Cost calculation rates */
  costRates?: {
    embeddingPerToken?: number;
    vectorSearchPerOp?: number;
    rerankPerItem?: number;
    llmInputPerToken?: number;
    llmOutputPerToken?: number;
  };
}
