/**
 * Seizn Spring - Memory Layer SDK
 *
 * The Spring Memory API provides semantic memory storage and retrieval
 * for AI applications. Store facts, preferences, experiences, and more
 * with automatic embedding and similarity search.
 *
 * @example
 * ```typescript
 * import { SpringClient } from '@seizn/spring';
 *
 * const spring = new SpringClient({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   namespace: 'my-app',
 * });
 *
 * // Add memory
 * await spring.remember('User prefers dark mode');
 *
 * // Search memories
 * const memories = await spring.recall('UI preferences');
 * ```
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Client
export { SpringClient, createSpringClient } from './client';
