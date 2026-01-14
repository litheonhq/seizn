/**
 * Seizn Vercel AI SDK - Middleware
 *
 * Provides AI SDK middleware for automatic tracing, metrics, and RAG integration.
 * Middleware intercepts LLM calls to add observability and Seizn-specific features.
 *
 * @packageDocumentation
 * @module @seizn/vercel-ai/middleware
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { seiznMiddleware } from '@seizn/vercel-ai/middleware';
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   experimental_telemetry: {
 *     isEnabled: true,
 *   },
 *   middleware: seiznMiddleware({
 *     apiKey: process.env.SEIZN_API_KEY!,
 *     enableTracing: true,
 *   }),
 *   prompt: 'Hello!',
 * });
 * ```
 */

import type {
  Experimental_LanguageModelV1Middleware as LanguageModelV1Middleware,
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
} from 'ai';
import { SeiznClient, generateTraceId } from '@seizn/core';

// ============================================
// Types
// ============================================

/**
 * Configuration for Seizn middleware
 */
export interface SeiznMiddlewareConfig {
  /** API key for Seizn authentication */
  apiKey: string;
  /** Base URL for Seizn API (optional) */
  baseUrl?: string;
  /** Enable distributed tracing (default: true) */
  enableTracing?: boolean;
  /** Enable latency metrics (default: true) */
  enableMetrics?: boolean;
  /** Enable automatic RAG context injection (default: false) */
  enableAutoRAG?: boolean;
  /** Collection ID for auto RAG (required if enableAutoRAG is true) */
  ragCollectionId?: string;
  /** Number of RAG contexts to inject (default: 5) */
  ragTopK?: number;
  /** Custom trace metadata to include */
  traceMetadata?: Record<string, unknown>;
  /** Callback for trace events */
  onTrace?: (event: TraceEvent) => void;
  /** Callback for metrics */
  onMetrics?: (metrics: MiddlewareMetrics) => void;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Trace event emitted during LLM calls
 */
export interface TraceEvent {
  /** Event type */
  type: 'start' | 'end' | 'error' | 'rag';
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Timestamp */
  timestamp: string;
  /** Event data */
  data?: Record<string, unknown>;
}

/**
 * Metrics collected during LLM calls
 */
export interface MiddlewareMetrics {
  /** Trace ID for this call */
  traceId: string;
  /** Total latency in milliseconds */
  totalLatencyMs: number;
  /** RAG retrieval latency (if auto RAG enabled) */
  ragLatencyMs?: number;
  /** LLM call latency */
  llmLatencyMs: number;
  /** Model identifier */
  model?: string;
  /** Input token count (if available) */
  inputTokens?: number;
  /** Output token count (if available) */
  outputTokens?: number;
  /** RAG contexts used */
  ragContextsCount?: number;
  /** Whether the call was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Extended call options with Seizn metadata
 */
interface SeiznCallOptions extends LanguageModelV1CallOptions {
  seizn?: {
    traceId: string;
    spanId: string;
    ragContext?: string;
    ragTraceId?: string;
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate ISO timestamp
 */
function isoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Generate a random span ID
 */
function generateSpanId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extract model identifier from provider metadata
 */
function extractModelId(params: LanguageModelV1CallOptions): string | undefined {
  // Try to get model ID from various locations
  const providerMetadata = params.providerMetadata as Record<string, unknown> | undefined;
  if (providerMetadata?.modelId) {
    return String(providerMetadata.modelId);
  }
  return undefined;
}

/**
 * Inject RAG context into the prompt
 */
function injectRAGContext(
  params: LanguageModelV1CallOptions,
  ragContext: string
): LanguageModelV1CallOptions {
  const systemMessage = `Use the following context to answer questions. Always cite sources when using this information.

---CONTEXT---
${ragContext}
---END CONTEXT---

`;

  // Clone and modify prompt
  const newParams = { ...params };

  if (newParams.prompt) {
    // Handle different prompt types
    if (Array.isArray(newParams.prompt)) {
      // Find or create system message
      const systemIndex = newParams.prompt.findIndex(
        (m: { role: string }) => m.role === 'system'
      );
      if (systemIndex >= 0) {
        const systemMsg = newParams.prompt[systemIndex] as { role: string; content: string };
        newParams.prompt = [
          ...newParams.prompt.slice(0, systemIndex),
          { ...systemMsg, content: systemMessage + systemMsg.content },
          ...newParams.prompt.slice(systemIndex + 1),
        ];
      } else {
        newParams.prompt = [
          { role: 'system', content: systemMessage },
          ...newParams.prompt,
        ];
      }
    }
  }

  return newParams;
}

// ============================================
// Middleware Implementation
// ============================================

/**
 * Create Seizn middleware for AI SDK
 *
 * This middleware adds:
 * - Distributed tracing with unique trace IDs
 * - Latency metrics collection
 * - Automatic RAG context injection (optional)
 * - Error tracking and reporting
 *
 * @param config - Middleware configuration
 * @returns AI SDK middleware
 *
 * @example
 * ```typescript
 * // Basic usage with tracing
 * const middleware = seiznMiddleware({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   enableTracing: true,
 * });
 *
 * // With automatic RAG
 * const ragMiddleware = seiznMiddleware({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   enableAutoRAG: true,
 *   ragCollectionId: 'my-docs',
 * });
 * ```
 */
export function seiznMiddleware(
  config: SeiznMiddlewareConfig
): LanguageModelV1Middleware {
  const client = config.enableAutoRAG
    ? new SeiznClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        debug: config.debug,
      })
    : null;

  const log = (message: string, data?: Record<string, unknown>) => {
    if (config.debug) {
      console.log(`[Seizn Middleware] ${message}`, data ?? '');
    }
  };

  return {
    /**
     * Transform parameters before LLM call
     * - Inject trace context
     * - Optionally inject RAG context
     */
    transformParams: async ({ params }) => {
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      const startTime = Date.now();

      log('Transforming params', { traceId, spanId });

      // Emit start trace event
      if (config.enableTracing && config.onTrace) {
        config.onTrace({
          type: 'start',
          traceId,
          spanId,
          timestamp: isoTimestamp(),
          data: {
            model: extractModelId(params),
            ...config.traceMetadata,
          },
        });
      }

      // Prepare Seizn metadata
      let seiznMetadata: SeiznCallOptions['seizn'] = {
        traceId,
        spanId,
      };

      // Optionally inject RAG context
      let modifiedParams = params;
      if (config.enableAutoRAG && client && config.ragCollectionId) {
        try {
          // Extract query from prompt
          let query = '';
          if (Array.isArray(params.prompt)) {
            const userMessage = params.prompt.find(
              (m: { role: string; content?: string }) =>
                m.role === 'user' && typeof m.content === 'string'
            ) as { role: string; content: string } | undefined;
            query = userMessage?.content ?? '';
          } else if (typeof params.prompt === 'string') {
            query = params.prompt;
          }

          if (query) {
            const ragResponse = await client.retrieve({
              query,
              collectionId: config.ragCollectionId,
              topK: config.ragTopK ?? 5,
              rerank: true,
            });

            const ragContext = ragResponse.contexts
              .map((c, i) => `[${i + 1}] ${c.content}`)
              .join('\n\n');

            modifiedParams = injectRAGContext(params, ragContext);
            seiznMetadata = {
              ...seiznMetadata,
              ragContext,
              ragTraceId: ragResponse.traceId,
            };

            // Emit RAG trace event
            if (config.onTrace) {
              config.onTrace({
                type: 'rag',
                traceId,
                spanId,
                timestamp: isoTimestamp(),
                data: {
                  ragTraceId: ragResponse.traceId,
                  contextsCount: ragResponse.contexts.length,
                  latencyMs: Date.now() - startTime,
                },
              });
            }

            log('RAG context injected', {
              ragTraceId: ragResponse.traceId,
              contextsCount: ragResponse.contexts.length,
            });
          }
        } catch (error) {
          log('RAG injection failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        ...modifiedParams,
        providerMetadata: {
          ...modifiedParams.providerMetadata,
          seizn: {
            traceId,
            spanId,
            timestamp: isoTimestamp(),
            ...config.traceMetadata,
          },
        },
      };
    },

    /**
     * Wrap generate call to collect metrics
     */
    wrapGenerate: async ({ doGenerate, params }) => {
      const startTime = Date.now();
      const seiznMeta = (params.providerMetadata as { seizn?: { traceId: string; spanId: string } })?.seizn;
      const traceId = seiznMeta?.traceId ?? generateTraceId();
      const spanId = seiznMeta?.spanId ?? generateSpanId();

      log('Starting generate', { traceId });

      try {
        const result = await doGenerate();
        const latencyMs = Date.now() - startTime;

        // Emit end trace event
        if (config.enableTracing && config.onTrace) {
          config.onTrace({
            type: 'end',
            traceId,
            spanId,
            timestamp: isoTimestamp(),
            data: {
              latencyMs,
              success: true,
            },
          });
        }

        // Emit metrics
        if (config.enableMetrics && config.onMetrics) {
          config.onMetrics({
            traceId,
            totalLatencyMs: latencyMs,
            llmLatencyMs: latencyMs,
            model: extractModelId(params),
            inputTokens: result.usage?.promptTokens,
            outputTokens: result.usage?.completionTokens,
            success: true,
          });
        }

        log('Generate complete', { traceId, latencyMs });

        // Add Seizn metadata to result
        return {
          ...result,
          experimental_providerMetadata: {
            ...result.experimental_providerMetadata,
            seizn: {
              traceId,
              spanId,
              latencyMs,
              timestamp: isoTimestamp(),
            },
          },
        };
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Emit error trace event
        if (config.enableTracing && config.onTrace) {
          config.onTrace({
            type: 'error',
            traceId,
            spanId,
            timestamp: isoTimestamp(),
            data: {
              error: errorMessage,
              latencyMs,
            },
          });
        }

        // Emit error metrics
        if (config.enableMetrics && config.onMetrics) {
          config.onMetrics({
            traceId,
            totalLatencyMs: latencyMs,
            llmLatencyMs: latencyMs,
            model: extractModelId(params),
            success: false,
            error: errorMessage,
          });
        }

        log('Generate failed', { traceId, error: errorMessage });
        throw error;
      }
    },

    /**
     * Wrap stream call to collect metrics
     */
    wrapStream: async ({ doStream, params }) => {
      const startTime = Date.now();
      const seiznMeta = (params.providerMetadata as { seizn?: { traceId: string; spanId: string } })?.seizn;
      const traceId = seiznMeta?.traceId ?? generateTraceId();
      const spanId = seiznMeta?.spanId ?? generateSpanId();

      log('Starting stream', { traceId });

      try {
        const { stream, ...rest } = await doStream();

        // Create a wrapper stream to track completion
        const wrappedStream = new TransformStream<
          LanguageModelV1StreamPart,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            controller.enqueue(chunk);
          },
          flush() {
            const latencyMs = Date.now() - startTime;

            // Emit end trace event
            if (config.enableTracing && config.onTrace) {
              config.onTrace({
                type: 'end',
                traceId,
                spanId,
                timestamp: isoTimestamp(),
                data: {
                  latencyMs,
                  success: true,
                  streaming: true,
                },
              });
            }

            // Emit metrics
            if (config.enableMetrics && config.onMetrics) {
              config.onMetrics({
                traceId,
                totalLatencyMs: latencyMs,
                llmLatencyMs: latencyMs,
                model: extractModelId(params),
                success: true,
              });
            }

            log('Stream complete', { traceId, latencyMs });
          },
        });

        return {
          ...rest,
          stream: stream.pipeThrough(wrappedStream),
        };
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Emit error events
        if (config.enableTracing && config.onTrace) {
          config.onTrace({
            type: 'error',
            traceId,
            spanId,
            timestamp: isoTimestamp(),
            data: {
              error: errorMessage,
              latencyMs,
            },
          });
        }

        if (config.enableMetrics && config.onMetrics) {
          config.onMetrics({
            traceId,
            totalLatencyMs: latencyMs,
            llmLatencyMs: latencyMs,
            model: extractModelId(params),
            success: false,
            error: errorMessage,
          });
        }

        log('Stream failed', { traceId, error: errorMessage });
        throw error;
      }
    },
  };
}

/**
 * Create a tracing-only middleware (no RAG, just observability)
 *
 * Lightweight middleware that only adds trace IDs and metrics
 * without the overhead of RAG retrieval.
 *
 * @param config - Tracing configuration
 * @returns AI SDK middleware
 */
export function seiznTracingMiddleware(config: {
  onTrace?: (event: TraceEvent) => void;
  onMetrics?: (metrics: MiddlewareMetrics) => void;
  traceMetadata?: Record<string, unknown>;
  debug?: boolean;
}): LanguageModelV1Middleware {
  return seiznMiddleware({
    apiKey: '', // Not needed for tracing only
    enableTracing: true,
    enableMetrics: true,
    enableAutoRAG: false,
    onTrace: config.onTrace,
    onMetrics: config.onMetrics,
    traceMetadata: config.traceMetadata,
    debug: config.debug,
  });
}

/**
 * Create a RAG-enabled middleware
 *
 * Middleware that automatically retrieves and injects relevant context
 * from a Seizn collection before each LLM call.
 *
 * @param config - RAG configuration
 * @returns AI SDK middleware
 */
export function seiznRAGMiddleware(config: {
  apiKey: string;
  collectionId: string;
  baseUrl?: string;
  topK?: number;
  onTrace?: (event: TraceEvent) => void;
  onMetrics?: (metrics: MiddlewareMetrics) => void;
  debug?: boolean;
}): LanguageModelV1Middleware {
  return seiznMiddleware({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    enableTracing: true,
    enableMetrics: true,
    enableAutoRAG: true,
    ragCollectionId: config.collectionId,
    ragTopK: config.topK,
    onTrace: config.onTrace,
    onMetrics: config.onMetrics,
    debug: config.debug,
  });
}
