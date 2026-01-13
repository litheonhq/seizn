/**
 * Seizn LangChain Connector - Type Definitions
 *
 * Type definitions for LangChain/LangGraph integration.
 * These types bridge Seizn's memory and retrieval systems with LangChain's interfaces.
 */

import type { Memory, MemoryType, MemoryScope, SearchMode } from '@/lib/spring/types';
import type { VectorSearchResult, RetrievalMode } from '@/lib/summer/types';

// ============================================
// Retriever Types
// ============================================

export interface SeizRetrieverConfig {
  /** Seizn API key */
  apiKey: string;
  /** Base URL for Seizn API (default: https://seizn.com/api) */
  baseUrl?: string;
  /** Collection ID for retrieval */
  collectionId: string;
  /** User ID for scoped retrieval */
  userId: string;
  /** Search mode: vector, keyword, or hybrid */
  mode?: RetrievalMode;
  /** Number of documents to retrieve */
  topK?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Enable reranking */
  rerank?: boolean;
  /** Enable federated retrieval */
  federated?: boolean;
  /** Enable autopilot mode */
  autopilot?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable Flight Recorder tracing */
  enableTracing?: boolean;
}

export interface SeizRetrieverMetadata {
  /** Original chunk ID */
  chunkId: string;
  /** Source document ID */
  documentId: string;
  /** Similarity score */
  similarity: number;
  /** Keyword ranking (for hybrid search) */
  keywordRank?: number;
  /** Combined score (for hybrid search) */
  combinedScore?: number;
  /** Source identifier */
  source?: string;
  /** Additional metadata from the document */
  [key: string]: unknown;
}

export interface SeizDocument {
  /** Document content */
  pageContent: string;
  /** Document metadata */
  metadata: SeizRetrieverMetadata;
}

// ============================================
// Memory Types
// ============================================

export interface SeizMemoryConfig {
  /** Seizn API key */
  apiKey: string;
  /** Base URL for Seizn API */
  baseUrl?: string;
  /** Memory namespace */
  namespace?: string;
  /** User ID for scoped memory */
  userId?: string;
  /** Session ID for session-scoped memory */
  sessionId?: string;
  /** Memory retrieval mode */
  searchMode?: SearchMode;
  /** Number of memories to retrieve for context */
  k?: number;
  /** Minimum similarity threshold */
  threshold?: number;
  /** Memory input key name */
  inputKey?: string;
  /** Memory output key name */
  outputKey?: string;
  /** Human message prefix */
  humanPrefix?: string;
  /** AI message prefix */
  aiPrefix?: string;
  /** Return messages as list vs string */
  returnMessages?: boolean;
  /** Request timeout */
  timeout?: number;
}

export interface SeizMemoryVariables {
  /** Chat history string or messages */
  history: string | ChatMessage[];
  /** Retrieved relevant memories */
  memories?: Memory[];
}

export interface ChatMessage {
  role: 'human' | 'ai' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SaveContextInput {
  /** Human input */
  input: string;
  /** AI response */
  output: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
}

// ============================================
// Callback Handler Types
// ============================================

export interface SeizCallbackConfig {
  /** Seizn API key */
  apiKey: string;
  /** Base URL for Seizn API */
  baseUrl?: string;
  /** User ID for tracing */
  userId: string;
  /** Plan tier */
  plan?: string;
  /** Collection ID (if applicable) */
  collectionId?: string;
  /** Enable detailed tracing */
  verbose?: boolean;
  /** Custom trace metadata */
  metadata?: Record<string, unknown>;
  /** Callback for trace completion */
  onTraceComplete?: (trace: TraceResult) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

export interface SpanData {
  /** Span name */
  name: string;
  /** Start time */
  startTime: number;
  /** End time */
  endTime?: number;
  /** Duration in ms */
  durationMs?: number;
  /** Span status */
  status: 'running' | 'success' | 'error';
  /** Input data */
  input?: Record<string, unknown>;
  /** Output data */
  output?: Record<string, unknown>;
  /** Error message */
  error?: string;
  /** Parent span ID */
  parentId?: string;
  /** Child spans */
  children: SpanData[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface TraceResult {
  /** Trace ID */
  traceId: string;
  /** Request ID */
  requestId: string;
  /** Total duration in ms */
  totalDurationMs: number;
  /** All spans */
  spans: SpanData[];
  /** Token usage */
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Cost estimate in USD */
  estimatedCost?: number;
  /** Whether an error occurred */
  hasError: boolean;
  /** Error message if applicable */
  error?: string;
}

// ============================================
// LangChain Document Type (for compatibility)
// ============================================

/**
 * LangChain Document interface for compatibility
 * This allows SeizRetriever to work with LangChain without strict dependency
 */
export interface Document<Metadata extends Record<string, unknown> = Record<string, unknown>> {
  pageContent: string;
  metadata: Metadata;
}

// ============================================
// Utility Types
// ============================================

export interface SeizError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
