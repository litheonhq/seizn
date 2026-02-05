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

// Memory v3 (Advanced)
export * from './memory-v3';

// Memory v4 (Mem0-Inspired) - exclude types that conflict with v3
export {
  // Services
  CandidateService,
  createCandidateService,
  EdgeService,
  createEdgeService,
  IngestionService,
  createIngestionService,
  JobService,
  createJobService,
  SearchServiceV3,
  createSearchServiceV3,
  MultimodalService,
  createMultimodalService,
  // Types (renamed to avoid conflicts)
  type EdgeType as EdgeTypeV4,
  type MemoryEdge,
  type CreateEdgeInput,
  type EdgeWithMemory,
  type GraphNeighbor,
  type MemoryCandidate as MemoryCandidateV4,
  type CreateCandidateInput,
  type CandidateListOptions,
  type ReviewResult,
  type SearchV3Request,
  type SearchV3Response,
  type SearchV3Result,
  type SearchFiltersV3,
  type FilterCondition,
  type FilterGroup,
  type FilterOperator,
  type TimeFilter,
  type IngestionRule,
  type IngestionSettings,
  type IngestionRuleInput,
  type IngestionSettingsInput,
  type IngestionDecision,
  type IngestionAction,
  type StrictnessLevel,
  type Job,
  type JobType,
  type JobStatus,
  type CreateJobInput,
  type JobProgress,
  type HNSWConfig,
  type RecallMode,
  calculateEfSearch,
} from './memory-v4';
