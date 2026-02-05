/**
 * Seizn Vercel AI SDK Integration
 *
 * Vercel AI SDK compatible components for Seizn's memory systems.
 *
 * This module provides:
 * - Memory Tools: AI-callable tools for searching, storing, and managing memories
 * - Memory Middleware: Automatic context injection for AI requests
 *
 * @example Memory Tools Usage
 * ```typescript
 * import { createSeizNMemoryTools } from '@/lib/integrations/vercel-ai';
 * import { generateText } from 'ai';
 *
 * const tools = createSeizNMemoryTools({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * const result = await generateText({
 *   model: openai('gpt-4'),
 *   tools,
 *   prompt: 'Remember that I prefer dark mode',
 * });
 * ```
 *
 * @example Memory Middleware Usage
 * ```typescript
 * import { withSeizNMemory } from '@/lib/integrations/vercel-ai';
 *
 * const middleware = withSeizNMemory({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * // In API route
 * export async function POST(request: Request) {
 *   const { body, memories, formattedContext } = await middleware(request);
 *
 *   return generateText({
 *     model: openai('gpt-4'),
 *     system: `User context:\n${formattedContext}`,
 *     prompt: body.messages[body.messages.length - 1].content,
 *   });
 * }
 * ```
 *
 * @example Combined Tools and Middleware
 * ```typescript
 * import {
 *   createSeizNMemoryTools,
 *   withSeizNMemory,
 * } from '@/lib/integrations/vercel-ai';
 * import { streamText } from 'ai';
 *
 * const config = {
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * };
 *
 * const tools = createSeizNMemoryTools(config);
 * const middleware = withSeizNMemory(config, { injectIntoSystem: true });
 *
 * export async function POST(request: Request) {
 *   const { body, formattedContext } = await middleware(request);
 *
 *   return streamText({
 *     model: openai('gpt-4'),
 *     tools,
 *     messages: body.messages,
 *   });
 * }
 * ```
 *
 * @packageDocumentation
 */

// Memory Tools
export {
  createSeizNMemoryTools,
  createReadOnlyMemoryTools,
  createNamedMemoryTools,
  type SeizNConfig,
  type SearchMemoryResult,
  type StoreMemoryResult,
  type ForgetMemoryResult,
} from './memory-provider';

// Memory Middleware
export {
  withSeizNMemory,
  createContextRetriever,
  withMemoryContext,
  type SeizNConfig as MiddlewareConfig,
  type MiddlewareContext,
  type MiddlewareOptions,
  type MemoryContext,
} from './memory-middleware';
