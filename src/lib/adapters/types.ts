/**
 * Framework Adapter Types
 *
 * Common types for integrating Seizn with popular AI frameworks.
 */

// ============================================
// Base Types
// ============================================

export interface SeizConfig {
  apiKey: string;
  baseUrl?: string;
  userId?: string;
  sessionId?: string;
  namespace?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryPayload {
  content: string;
  memoryType?: 'fact' | 'preference' | 'instruction' | 'experience' | 'relationship';
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryQuery {
  query: string;
  limit?: number;
  memoryTypes?: string[];
  threshold?: number;
  includeMetadata?: boolean;
}

export interface MemoryResult {
  id: string;
  content: string;
  memoryType: string;
  similarity: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface TracePayload {
  name: string;
  input?: unknown;
  output?: unknown;
  modelId?: string;
  modelProvider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  cost?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================
// LangChain Types
// ============================================

export interface LangChainCallbackConfig {
  runId?: string;
  runName?: string;
  runType?: string;
  parentRunId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface LangChainMemoryConfig extends SeizConfig {
  memoryKey?: string;
  inputKey?: string;
  outputKey?: string;
  returnMessages?: boolean;
  humanPrefix?: string;
  aiPrefix?: string;
}

// ============================================
// LlamaIndex Types
// ============================================

export interface LlamaIndexCallbackConfig {
  eventId?: string;
  eventType?: string;
  parentEventId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface LlamaIndexStorageConfig extends SeizConfig {
  collectionName?: string;
  embeddingDimension?: number;
  similarityMetric?: 'cosine' | 'dot_product' | 'euclidean';
}

// ============================================
// Vercel AI SDK Types
// ============================================

export interface VercelAIConfig extends SeizConfig {
  enableStreaming?: boolean;
  traceRequests?: boolean;
  traceResponses?: boolean;
}

export interface VercelAIStreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onText?: (text: string) => void;
  onCompletion?: (completion: string) => void;
  onFinal?: (completion: string) => void;
}

// ============================================
// Callback Handler Interface
// ============================================

export interface SeizCallbackHandler {
  onLLMStart(
    llm: { name: string; provider?: string },
    prompts: string[],
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onLLMEnd(
    output: { generations: Array<{ text: string }[]> },
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onLLMError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onChainStart(
    chain: { name: string },
    inputs: Record<string, unknown>,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onChainError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onToolStart(
    tool: { name: string },
    input: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onToolEnd(
    output: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onToolError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onRetrieverStart(
    retriever: { name: string },
    query: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onRetrieverEnd(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;

  onRetrieverError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): void | Promise<void>;
}

// ============================================
// Memory Interface
// ============================================

export interface SeizMemoryInterface {
  loadMemoryVariables(inputs: Record<string, unknown>): Promise<Record<string, unknown>>;
  saveContext(
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>
  ): Promise<void>;
  clear(): Promise<void>;
}

// ============================================
// Vector Store Interface
// ============================================

export interface SeizVectorStoreInterface {
  addDocuments(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>
  ): Promise<string[]>;

  similaritySearch(
    query: string,
    k?: number,
    filter?: Record<string, unknown>
  ): Promise<Array<{ content: string; metadata?: Record<string, unknown>; score: number }>>;

  delete(ids: string[]): Promise<void>;
}
