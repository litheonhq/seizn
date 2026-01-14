/**
 * Seizn Vercel AI SDK - Custom Provider
 *
 * Provides a custom AI SDK provider that integrates RAG retrieval
 * directly into the model interface, creating a unified RAG pipeline.
 *
 * @packageDocumentation
 * @module @seizn/vercel-ai/provider
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { createSeiznRAGProvider } from '@seizn/vercel-ai/provider';
 *
 * const seizn = createSeiznRAGProvider({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   baseModel: openai('gpt-4o'),
 * });
 *
 * const result = await generateText({
 *   model: seizn.rag('my-docs'),
 *   prompt: 'What is the return policy?',
 * });
 *
 * // Access RAG metadata
 * console.log(result.experimental_providerMetadata?.seizn);
 * ```
 */

import type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1ProviderMetadata,
  LanguageModelV1StreamPart,
} from 'ai';
import { SeiznClient, generateTraceId } from '@seizn/core';
import type { RetrievalResponse, Context } from '@seizn/core';

// ============================================
// Types
// ============================================

/**
 * Configuration for Seizn RAG provider
 */
export interface SeiznRAGProviderConfig {
  /** API key for Seizn authentication */
  apiKey: string;
  /** Base URL for Seizn API (optional) */
  baseUrl?: string;
  /** Default collection ID */
  defaultCollectionId?: string;
  /** Base LLM model to wrap */
  baseModel: LanguageModelV1;
  /** Default number of contexts to retrieve */
  defaultTopK?: number;
  /** Default minimum score threshold */
  defaultMinScore?: number;
  /** Custom system prompt template */
  systemPromptTemplate?: (context: string) => string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Options for RAG model creation
 */
export interface RAGModelOptions {
  /** Collection ID to search */
  collectionId?: string;
  /** Number of contexts to retrieve */
  topK?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** Metadata filters */
  filters?: Record<string, unknown>;
  /** Custom system prompt override */
  systemPrompt?: string;
}

/**
 * Seizn RAG metadata attached to responses
 */
export interface SeiznRAGMetadata {
  /** Trace ID for the RAG operation */
  traceId: string;
  /** RAG retrieval trace ID */
  ragTraceId: string;
  /** Number of contexts retrieved */
  contextsCount: number;
  /** Average context score */
  avgScore: number;
  /** RAG retrieval latency */
  ragLatencyMs: number;
  /** Total latency */
  totalLatencyMs: number;
  /** Citations for attribution */
  citations: Array<{
    index: number;
    source: string;
    url?: string;
  }>;
  /** Receipt for verification */
  receipt: {
    queryHash: string;
    resultHash: string;
    timestamp: string;
  };
}

/**
 * Provider instance returned by createSeiznRAGProvider
 */
export interface SeiznRAGProvider {
  /** Create a RAG-enabled model for a specific collection */
  rag: (collectionIdOrOptions?: string | RAGModelOptions) => LanguageModelV1;
  /** Create a RAG-enabled model with default settings */
  model: () => LanguageModelV1;
  /** Access the underlying Seizn client */
  client: SeiznClient;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Default system prompt template
 */
const DEFAULT_SYSTEM_TEMPLATE = (context: string) =>
  `You are a helpful AI assistant. Use the following context to answer questions accurately. Always cite your sources using the citation numbers provided.

---CONTEXT---
${context}
---END CONTEXT---

Important instructions:
1. Base your answers on the provided context
2. Cite sources using [1], [2], etc. when referencing specific information
3. If the context doesn't contain relevant information, say so
4. Be concise but thorough`;

/**
 * Format contexts for injection into prompt
 */
function formatContexts(contexts: Context[]): string {
  return contexts
    .map((ctx, idx) => `[${idx + 1}] ${ctx.content}`)
    .join('\n\n');
}

/**
 * Calculate average score from contexts
 */
function calculateAvgScore(contexts: Context[]): number {
  if (contexts.length === 0) return 0;
  const sum = contexts.reduce((acc, ctx) => acc + ctx.score, 0);
  return sum / contexts.length;
}

/**
 * Extract query from call options
 */
function extractQuery(options: LanguageModelV1CallOptions): string {
  if (Array.isArray(options.prompt)) {
    // Find the last user message
    for (let i = options.prompt.length - 1; i >= 0; i--) {
      const msg = options.prompt[i] as { role: string; content?: unknown };
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          return msg.content;
        }
        // Handle content array (multimodal)
        if (Array.isArray(msg.content)) {
          const textPart = msg.content.find(
            (p: { type: string; text?: string }) => p.type === 'text'
          ) as { type: string; text: string } | undefined;
          return textPart?.text ?? '';
        }
      }
    }
  } else if (typeof options.prompt === 'string') {
    return options.prompt;
  }
  return '';
}

/**
 * Inject system prompt into call options
 */
function injectSystemPrompt(
  options: LanguageModelV1CallOptions,
  systemPrompt: string
): LanguageModelV1CallOptions {
  const newOptions = { ...options };

  if (Array.isArray(newOptions.prompt)) {
    const hasSystem = newOptions.prompt.some(
      (m: { role: string }) => m.role === 'system'
    );
    if (hasSystem) {
      // Prepend to existing system message
      newOptions.prompt = newOptions.prompt.map((m: { role: string; content?: string }) => {
        if (m.role === 'system') {
          return { ...m, content: systemPrompt + '\n\n' + (m.content ?? '') };
        }
        return m;
      });
    } else {
      // Add system message at beginning
      newOptions.prompt = [
        { role: 'system', content: systemPrompt },
        ...newOptions.prompt,
      ];
    }
  }

  return newOptions;
}

// ============================================
// RAG Model Implementation
// ============================================

/**
 * Create a RAG-wrapped language model
 */
function createRAGModel(
  baseModel: LanguageModelV1,
  client: SeiznClient,
  ragOptions: Required<RAGModelOptions>,
  systemPromptTemplate: (context: string) => string,
  debug: boolean
): LanguageModelV1 {
  const log = (message: string, data?: Record<string, unknown>) => {
    if (debug) {
      console.log(`[Seizn RAG] ${message}`, data ?? '');
    }
  };

  return {
    // Pass through base model properties
    specificationVersion: baseModel.specificationVersion,
    provider: `seizn-rag:${baseModel.provider}`,
    modelId: `seizn-rag:${baseModel.modelId}`,
    defaultObjectGenerationMode: baseModel.defaultObjectGenerationMode,
    supportsImageUrls: baseModel.supportsImageUrls,
    supportsStructuredOutputs: baseModel.supportsStructuredOutputs,

    /**
     * Generate with RAG context injection
     */
    async doGenerate(options: LanguageModelV1CallOptions) {
      const startTime = Date.now();
      const traceId = generateTraceId();

      log('Starting RAG generate', { traceId, collectionId: ragOptions.collectionId });

      // Extract query from options
      const query = extractQuery(options);
      if (!query) {
        log('No query found, falling back to base model');
        return baseModel.doGenerate(options);
      }

      // Retrieve relevant contexts
      const ragStartTime = Date.now();
      let ragResponse: RetrievalResponse;
      try {
        ragResponse = await client.retrieve({
          query,
          collectionId: ragOptions.collectionId,
          topK: ragOptions.topK,
          minScore: ragOptions.minScore,
          filters: ragOptions.filters,
          rerank: true,
          includeMetadata: true,
        });
        log('RAG retrieval complete', {
          ragTraceId: ragResponse.traceId,
          contextsCount: ragResponse.contexts.length,
          latencyMs: Date.now() - ragStartTime,
        });
      } catch (error) {
        log('RAG retrieval failed, continuing without context', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return baseModel.doGenerate(options);
      }

      const ragLatencyMs = Date.now() - ragStartTime;

      // Format and inject context
      const formattedContext = formatContexts(ragResponse.contexts);
      const systemPrompt = ragOptions.systemPrompt ?? systemPromptTemplate(formattedContext);
      const modifiedOptions = injectSystemPrompt(options, systemPrompt);

      // Call base model
      const result = await baseModel.doGenerate(modifiedOptions);
      const totalLatencyMs = Date.now() - startTime;

      // Prepare Seizn metadata
      const seiznMetadata: SeiznRAGMetadata = {
        traceId,
        ragTraceId: ragResponse.traceId,
        contextsCount: ragResponse.contexts.length,
        avgScore: calculateAvgScore(ragResponse.contexts),
        ragLatencyMs,
        totalLatencyMs,
        citations: ragResponse.citations.map((c) => ({
          index: c.index,
          source: c.source,
          url: c.url,
        })),
        receipt: {
          queryHash: ragResponse.receipt.queryHash,
          resultHash: ragResponse.receipt.resultHash,
          timestamp: ragResponse.receipt.timestamp,
        },
      };

      log('RAG generate complete', { traceId, totalLatencyMs });

      // Return result with Seizn metadata
      return {
        ...result,
        experimental_providerMetadata: {
          ...result.experimental_providerMetadata,
          seizn: seiznMetadata,
        } as LanguageModelV1ProviderMetadata,
      };
    },

    /**
     * Stream with RAG context injection
     */
    async doStream(options: LanguageModelV1CallOptions) {
      const startTime = Date.now();
      const traceId = generateTraceId();

      log('Starting RAG stream', { traceId, collectionId: ragOptions.collectionId });

      // Extract query from options
      const query = extractQuery(options);
      if (!query) {
        log('No query found, falling back to base model');
        return baseModel.doStream(options);
      }

      // Retrieve relevant contexts
      const ragStartTime = Date.now();
      let ragResponse: RetrievalResponse;
      try {
        ragResponse = await client.retrieve({
          query,
          collectionId: ragOptions.collectionId,
          topK: ragOptions.topK,
          minScore: ragOptions.minScore,
          filters: ragOptions.filters,
          rerank: true,
          includeMetadata: true,
        });
        log('RAG retrieval complete', {
          ragTraceId: ragResponse.traceId,
          contextsCount: ragResponse.contexts.length,
          latencyMs: Date.now() - ragStartTime,
        });
      } catch (error) {
        log('RAG retrieval failed, continuing without context', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return baseModel.doStream(options);
      }

      const ragLatencyMs = Date.now() - ragStartTime;

      // Format and inject context
      const formattedContext = formatContexts(ragResponse.contexts);
      const systemPrompt = ragOptions.systemPrompt ?? systemPromptTemplate(formattedContext);
      const modifiedOptions = injectSystemPrompt(options, systemPrompt);

      // Call base model stream
      const streamResult = await baseModel.doStream(modifiedOptions);

      // Prepare Seizn metadata
      const seiznMetadata: SeiznRAGMetadata = {
        traceId,
        ragTraceId: ragResponse.traceId,
        contextsCount: ragResponse.contexts.length,
        avgScore: calculateAvgScore(ragResponse.contexts),
        ragLatencyMs,
        totalLatencyMs: 0, // Will be updated at stream end
        citations: ragResponse.citations.map((c) => ({
          index: c.index,
          source: c.source,
          url: c.url,
        })),
        receipt: {
          queryHash: ragResponse.receipt.queryHash,
          resultHash: ragResponse.receipt.resultHash,
          timestamp: ragResponse.receipt.timestamp,
        },
      };

      // Wrap stream to add metadata at the end
      const wrappedStream = new TransformStream<
        LanguageModelV1StreamPart,
        LanguageModelV1StreamPart
      >({
        transform(chunk, controller) {
          // Pass through all chunks
          controller.enqueue(chunk);
        },
        flush() {
          seiznMetadata.totalLatencyMs = Date.now() - startTime;
          log('RAG stream complete', { traceId, totalLatencyMs: seiznMetadata.totalLatencyMs });
        },
      });

      return {
        ...streamResult,
        stream: streamResult.stream.pipeThrough(wrappedStream),
        rawCall: {
          ...streamResult.rawCall,
          seiznMetadata,
        },
      };
    },
  };
}

// ============================================
// Provider Factory
// ============================================

/**
 * Create a Seizn RAG provider
 *
 * This provider wraps an existing LLM model and automatically injects
 * relevant context from Seizn before each call.
 *
 * @param config - Provider configuration
 * @returns Seizn RAG provider instance
 *
 * @example
 * ```typescript
 * import { openai } from '@ai-sdk/openai';
 * import { createSeiznRAGProvider } from '@seizn/vercel-ai/provider';
 *
 * const seizn = createSeiznRAGProvider({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   baseModel: openai('gpt-4o'),
 *   defaultCollectionId: 'product-docs',
 * });
 *
 * // Use with AI SDK
 * const result = await generateText({
 *   model: seizn.rag('product-docs'),
 *   prompt: 'What are the shipping options?',
 * });
 *
 * // Access RAG metadata
 * const metadata = result.experimental_providerMetadata?.seizn as SeiznRAGMetadata;
 * console.log(`Used ${metadata.contextsCount} contexts`);
 * console.log(`Citations: ${metadata.citations.map(c => c.source).join(', ')}`);
 * ```
 */
export function createSeiznRAGProvider(
  config: SeiznRAGProviderConfig
): SeiznRAGProvider {
  const client = new SeiznClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    debug: config.debug,
    defaultCollectionId: config.defaultCollectionId,
  });

  const systemPromptTemplate = config.systemPromptTemplate ?? DEFAULT_SYSTEM_TEMPLATE;

  return {
    /**
     * Create a RAG-enabled model for a specific collection
     */
    rag(collectionIdOrOptions?: string | RAGModelOptions): LanguageModelV1 {
      let options: RAGModelOptions;

      if (typeof collectionIdOrOptions === 'string') {
        options = { collectionId: collectionIdOrOptions };
      } else {
        options = collectionIdOrOptions ?? {};
      }

      const resolvedOptions: Required<RAGModelOptions> = {
        collectionId: options.collectionId ?? config.defaultCollectionId ?? '',
        topK: options.topK ?? config.defaultTopK ?? 5,
        minScore: options.minScore ?? config.defaultMinScore ?? 0,
        filters: options.filters ?? {},
        systemPrompt: options.systemPrompt ?? '',
      };

      if (!resolvedOptions.collectionId) {
        throw new Error(
          'Collection ID is required. Provide it via rag(collectionId) or defaultCollectionId in config.'
        );
      }

      return createRAGModel(
        config.baseModel,
        client,
        resolvedOptions,
        systemPromptTemplate,
        config.debug ?? false
      );
    },

    /**
     * Create a RAG-enabled model with default settings
     */
    model(): LanguageModelV1 {
      return this.rag();
    },

    /**
     * Access the underlying Seizn client
     */
    client,
  };
}

/**
 * Create a simple RAG model wrapper
 *
 * Convenience function for wrapping a model with RAG capabilities
 * without creating a full provider.
 *
 * @param options - Configuration options
 * @returns RAG-wrapped language model
 *
 * @example
 * ```typescript
 * import { openai } from '@ai-sdk/openai';
 * import { wrapWithRAG } from '@seizn/vercel-ai/provider';
 *
 * const ragModel = wrapWithRAG({
 *   baseModel: openai('gpt-4o'),
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'docs',
 * });
 *
 * const result = await generateText({
 *   model: ragModel,
 *   prompt: 'How do I get started?',
 * });
 * ```
 */
export function wrapWithRAG(options: {
  baseModel: LanguageModelV1;
  apiKey: string;
  collectionId: string;
  baseUrl?: string;
  topK?: number;
  minScore?: number;
  filters?: Record<string, unknown>;
  systemPromptTemplate?: (context: string) => string;
  debug?: boolean;
}): LanguageModelV1 {
  const provider = createSeiznRAGProvider({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    baseModel: options.baseModel,
    defaultCollectionId: options.collectionId,
    defaultTopK: options.topK,
    defaultMinScore: options.minScore,
    systemPromptTemplate: options.systemPromptTemplate,
    debug: options.debug,
  });

  return provider.rag({
    collectionId: options.collectionId,
    topK: options.topK,
    minScore: options.minScore,
    filters: options.filters,
  });
}
