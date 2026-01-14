/**
 * Seizn Vercel AI SDK - Tool Wrappers
 *
 * Provides AI SDK tool definitions for Seizn retrieval operations.
 * These tools can be used with any AI SDK compatible model (OpenAI, Anthropic, etc.)
 *
 * @packageDocumentation
 * @module @seizn/vercel-ai/tools
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { createSeiznRetrievalTool } from '@seizn/vercel-ai/tools';
 *
 * const seiznRetrieval = createSeiznRetrievalTool({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 * });
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   tools: { seiznRetrieval },
 *   prompt: 'What is the return policy?',
 * });
 * ```
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SeiznClient } from '@seizn/core';
import type { RetrievalResponse, Context } from '@seizn/core';

// ============================================
// Types
// ============================================

/**
 * Configuration for Seizn retrieval tool
 */
export interface SeiznRetrievalToolConfig {
  /** API key for Seizn authentication */
  apiKey: string;
  /** Default collection ID to search within */
  collectionId?: string;
  /** Base URL for Seizn API (optional) */
  baseUrl?: string;
  /** Default number of results to return */
  defaultTopK?: number;
  /** Minimum similarity threshold (0-1) */
  defaultMinScore?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result returned by the retrieval tool
 */
export interface RetrievalToolResult {
  /** Retrieved context contents */
  contexts: string[];
  /** Full context objects with metadata */
  contextObjects: Array<{
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
    sourceId?: string;
  }>;
  /** Source citations */
  citations: Array<{
    index: number;
    source: string;
    url?: string;
    excerpt?: string;
  }>;
  /** Trace ID for debugging */
  traceId: string;
  /** Cryptographic receipt */
  receipt: {
    queryHash: string;
    resultHash: string;
    timestamp: string;
  };
  /** Query latency in milliseconds */
  latencyMs: number;
}

/**
 * Configuration for document search tool
 */
export interface SeiznDocumentSearchConfig extends SeiznRetrievalToolConfig {
  /** Enable reranking (default: true) */
  rerank?: boolean;
  /** Include metadata in results (default: true) */
  includeMetadata?: boolean;
}

/**
 * Configuration for multi-collection search tool
 */
export interface SeiznMultiCollectionSearchConfig {
  /** API key for Seizn authentication */
  apiKey: string;
  /** Collection IDs to search across */
  collectionIds: string[];
  /** Base URL for Seizn API (optional) */
  baseUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Transform Seizn response to tool result format
 */
function transformToToolResult(response: RetrievalResponse): RetrievalToolResult {
  return {
    contexts: response.contexts.map((c) => c.content),
    contextObjects: response.contexts.map((c) => ({
      id: c.id,
      content: c.content,
      score: c.score,
      metadata: c.metadata,
      sourceId: c.sourceId,
    })),
    citations: response.citations.map((c) => ({
      index: c.index,
      source: c.source,
      url: c.url,
      excerpt: c.excerpt,
    })),
    traceId: response.traceId,
    receipt: {
      queryHash: response.receipt.queryHash,
      resultHash: response.receipt.resultHash,
      timestamp: response.receipt.timestamp,
    },
    latencyMs: response.latencyMs,
  };
}

/**
 * Format contexts for LLM consumption
 */
function formatContextsForLLM(contexts: Context[]): string {
  return contexts
    .map((ctx, idx) => {
      const citation = `[${idx + 1}]`;
      return `${citation} ${ctx.content}`;
    })
    .join('\n\n');
}

// ============================================
// Tool Definitions
// ============================================

/**
 * Create a Seizn retrieval tool for AI SDK
 *
 * This tool searches the Seizn knowledge base and returns relevant contexts
 * with citations and cryptographic receipts for traceability.
 *
 * @param config - Tool configuration
 * @returns AI SDK tool definition
 *
 * @example
 * ```typescript
 * const seiznRetrieval = createSeiznRetrievalTool({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'docs',
 * });
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   tools: { seiznRetrieval },
 *   prompt: 'What are the key features?',
 * });
 * ```
 */
export function createSeiznRetrievalTool(config: SeiznRetrievalToolConfig) {
  const client = new SeiznClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    debug: config.debug,
    defaultCollectionId: config.collectionId,
  });

  return tool({
    description:
      'Search for relevant information from the Seizn knowledge base. ' +
      'Use this tool to find context and citations for answering questions. ' +
      'Returns relevant text passages with source citations and traceability.',
    parameters: z.object({
      query: z.string().describe('The search query to find relevant information'),
      topK: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of results to return (default: 5, max: 50)'),
      collectionId: z
        .string()
        .optional()
        .describe('Specific collection ID to search in (optional)'),
      minScore: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Minimum similarity threshold (0-1)'),
    }),
    execute: async ({ query, topK, collectionId, minScore }) => {
      const response = await client.retrieve({
        query,
        collectionId: collectionId ?? config.collectionId,
        topK: topK ?? config.defaultTopK ?? 5,
        minScore: minScore ?? config.defaultMinScore,
        rerank: true,
        includeMetadata: true,
      });

      return transformToToolResult(response);
    },
  });
}

/**
 * Create a document search tool with enhanced formatting
 *
 * This tool is optimized for RAG (Retrieval-Augmented Generation) use cases,
 * returning formatted contexts ready for LLM consumption.
 *
 * @param config - Tool configuration
 * @returns AI SDK tool definition
 *
 * @example
 * ```typescript
 * const docSearch = createSeiznDocumentSearchTool({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'product-docs',
 * });
 * ```
 */
export function createSeiznDocumentSearchTool(config: SeiznDocumentSearchConfig) {
  const client = new SeiznClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    debug: config.debug,
    defaultCollectionId: config.collectionId,
  });

  return tool({
    description:
      'Search documents in the knowledge base and retrieve relevant passages. ' +
      'Returns formatted text with inline citations ready for answering questions. ' +
      'Use this for any question that requires factual information from documents.',
    parameters: z.object({
      query: z.string().describe('The search query'),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe('Number of document passages to retrieve'),
      filters: z
        .record(z.unknown())
        .optional()
        .describe('Metadata filters to narrow search (e.g., { category: "api" })'),
    }),
    execute: async ({ query, topK, filters }) => {
      const response = await client.retrieve({
        query,
        collectionId: config.collectionId,
        topK: topK ?? config.defaultTopK ?? 5,
        filters,
        rerank: config.rerank ?? true,
        includeMetadata: config.includeMetadata ?? true,
      });

      // Return formatted context for LLM
      return {
        formattedContext: formatContextsForLLM(response.contexts),
        sources: response.citations.map((c) => ({
          index: c.index,
          title: c.source,
          url: c.url,
        })),
        traceId: response.traceId,
        documentCount: response.contexts.length,
      };
    },
  });
}

/**
 * Create a multi-collection search tool
 *
 * This tool searches across multiple collections and aggregates results.
 * Useful for organizations with different knowledge bases.
 *
 * @param config - Tool configuration with multiple collection IDs
 * @returns AI SDK tool definition
 *
 * @example
 * ```typescript
 * const multiSearch = createSeiznMultiCollectionSearchTool({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionIds: ['docs', 'faq', 'support'],
 * });
 * ```
 */
export function createSeiznMultiCollectionSearchTool(
  config: SeiznMultiCollectionSearchConfig
) {
  const client = new SeiznClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    debug: config.debug,
  });

  return tool({
    description:
      'Search across multiple knowledge base collections simultaneously. ' +
      'Use this when information might be spread across different document collections. ' +
      'Returns aggregated results from all specified collections.',
    parameters: z.object({
      query: z.string().describe('The search query'),
      topKPerCollection: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(3)
        .describe('Number of results per collection'),
      collectionIds: z
        .array(z.string())
        .optional()
        .describe('Specific collection IDs to search (optional, defaults to all configured)'),
    }),
    execute: async ({ query, topKPerCollection, collectionIds }) => {
      const targetCollections = collectionIds ?? config.collectionIds;

      // Search all collections in parallel
      const results = await Promise.all(
        targetCollections.map(async (collectionId) => {
          try {
            const response = await client.retrieve({
              query,
              collectionId,
              topK: topKPerCollection ?? 3,
              rerank: true,
            });
            return {
              collectionId,
              contexts: response.contexts,
              citations: response.citations,
              traceId: response.traceId,
            };
          } catch (error) {
            // Return empty result for failed collection
            return {
              collectionId,
              contexts: [],
              citations: [],
              traceId: null,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      );

      // Aggregate and sort by score
      const allContexts = results
        .flatMap((r) =>
          r.contexts.map((ctx) => ({
            ...ctx,
            collectionId: r.collectionId,
          }))
        )
        .sort((a, b) => b.score - a.score);

      return {
        contexts: allContexts.slice(0, 10),
        collectionResults: results.map((r) => ({
          collectionId: r.collectionId,
          count: r.contexts.length,
          traceId: r.traceId,
        })),
        totalFound: allContexts.length,
      };
    },
  });
}

/**
 * Create a simple Q&A tool that formats response for direct use
 *
 * This tool is designed for simple question-answering scenarios
 * where you want the LLM to use the retrieved context directly.
 *
 * @param config - Tool configuration
 * @returns AI SDK tool definition
 */
export function createSeiznQATool(config: SeiznRetrievalToolConfig) {
  const client = new SeiznClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    debug: config.debug,
    defaultCollectionId: config.collectionId,
  });

  return tool({
    description:
      'Answer a question using the knowledge base. ' +
      'Returns the most relevant context passages to help answer the question. ' +
      'Always cite sources when using information from this tool.',
    parameters: z.object({
      question: z.string().describe('The question to answer'),
    }),
    execute: async ({ question }) => {
      const response = await client.retrieve({
        query: question,
        collectionId: config.collectionId,
        topK: config.defaultTopK ?? 5,
        rerank: true,
        includeMetadata: true,
      });

      if (response.contexts.length === 0) {
        return {
          found: false,
          message: 'No relevant information found in the knowledge base.',
          suggestion: 'Try rephrasing the question or asking about a different topic.',
        };
      }

      return {
        found: true,
        context: formatContextsForLLM(response.contexts),
        sources: response.citations.map((c) => `[${c.index}] ${c.source}${c.url ? ` (${c.url})` : ''}`).join('\n'),
        confidence: response.contexts[0]?.score ?? 0,
        traceId: response.traceId,
      };
    },
  });
}

/**
 * Create a citation verification tool
 *
 * This tool verifies claims by searching for supporting evidence
 * and returns whether the claim is supported by the knowledge base.
 *
 * @param config - Tool configuration
 * @returns AI SDK tool definition
 */
export function createSeiznVerificationTool(config: SeiznRetrievalToolConfig) {
  const client = new SeiznClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    debug: config.debug,
    defaultCollectionId: config.collectionId,
  });

  return tool({
    description:
      'Verify a claim or statement against the knowledge base. ' +
      'Returns whether the claim is supported, contradicted, or uncertain based on available evidence.',
    parameters: z.object({
      claim: z.string().describe('The claim or statement to verify'),
    }),
    execute: async ({ claim }) => {
      const response = await client.retrieve({
        query: claim,
        collectionId: config.collectionId,
        topK: 5,
        minScore: 0.5,
        rerank: true,
      });

      if (response.contexts.length === 0) {
        return {
          status: 'uncertain' as const,
          reason: 'No relevant information found to verify this claim.',
          evidence: [],
          traceId: response.traceId,
        };
      }

      const highConfidenceContexts = response.contexts.filter((c) => c.score >= 0.7);
      const hasStrongEvidence = highConfidenceContexts.length > 0;

      return {
        status: hasStrongEvidence ? ('supported' as const) : ('uncertain' as const),
        confidence: response.contexts[0]?.score ?? 0,
        evidence: response.contexts.slice(0, 3).map((c) => ({
          content: c.content,
          score: c.score,
          sourceId: c.sourceId,
        })),
        citations: response.citations.slice(0, 3),
        traceId: response.traceId,
        receipt: response.receipt,
      };
    },
  });
}
