/**
 * Seizn - AI Memory Infrastructure for Developers
 *
 * @example
 * ```typescript
 * import { Seizn } from 'seizn';
 *
 * const client = new Seizn({ apiKey: 'sk_...' });
 *
 * // Add a memory
 * await client.add('User prefers dark mode');
 *
 * // Search memories
 * const results = await client.search('user preferences');
 *
 * // Extract from conversation
 * const memories = await client.extract('User: I work at Google...');
 *
 * // Query with memory context
 * const response = await client.query('What do you know about me?');
 * ```
 */

export { Seizn, SeiznError } from './client';
export type {
  Memory,
  MemoryType,
  MemoryScope,
  SearchResult,
  SearchMode,
  ExtractedMemory,
  QueryResponse,
  ConversationMessage,
  ConversationSummary,
  Webhook,
  WebhookEvent,
  WebhookDelivery,
  AddMemoryOptions,
  SearchOptions,
  ExtractOptions,
  QueryOptions,
  SummarizeOptions,
  CreateWebhookOptions,
  SeiznConfig,
} from './types';
