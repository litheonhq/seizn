/**
 * Memory v4 Module (Mem0-Inspired)
 *
 * Advanced memory management with ingestion controls, semantic updates,
 * query expansion, and usage tracking.
 *
 * @module spring/memory-v4
 */

// Types
export * from './types';

// Ingestion Service
export { IngestionService, createIngestionService } from './ingestion-service';

// Search Service v3 (with HNSW optimization)
export {
  SearchServiceV3,
  createSearchServiceV3,
  calculateEfSearch,
  type RecallMode,
  type HNSWConfig,
} from './search-service';

// Semantic Update Service
export { SemanticUpdateService, createSemanticUpdateService } from './semantic-update-service';

// Usage Service
export { MemoryUsageService, createMemoryUsageService } from './usage-service';

// Job Service
export { JobService, createJobService } from './job-service';

// Multimodal Service
export { MultimodalService, createMultimodalService } from './multimodal-service';

// Candidate Service
export {
  CandidateService,
  createCandidateService,
  type MemoryCandidate,
  type CreateCandidateInput,
  type CandidateListOptions,
  type ReviewResult,
} from './candidate-service';

// Edge Service
export {
  EdgeService,
  createEdgeService,
  type EdgeType,
  type MemoryEdge,
  type CreateEdgeInput,
  type EdgeWithMemory,
  type GraphNeighbor,
} from './edge-service';

// MCP Tools
export {
  SPRING_MEMORY_TOOLS,
  executeSpringMemoryTool,
  getSpringMemoryToolDefinitions,
  handleSpringMCPToolCall,
  type SpringMemoryToolContext,
} from './mcp-tools';

// Note Builder Service (A-MEM)
export {
  NoteBuilderService,
  createNoteBuilderService,
  type NoteBuilderConfig,
  type ExtractedMetadata,
  type ExtractedEntity,
  type BatchBuildResult,
} from './note-builder';

// Link Generator Service (A-MEM)
export {
  LinkGeneratorService,
  createLinkGeneratorService,
  type LinkCandidate,
  type LinkGeneratorConfig,
  type LinkGenerationResult,
  type BatchLinkResult,
} from './link-generator';

// Tier Manager Service (MemGPT-style)
export {
  TierManagerService,
  createTierManagerService,
  type MemoryTier,
  type TierConfig,
  type TierBudget,
  type TierPolicy,
  type TypeTierRule,
  type TierStats,
  type RebalanceResult,
  type TierMemory,
} from './tier-manager';

// Context Service (Zep/Memobase-style)
export {
  ContextService,
  createContextService,
  type ContextFormat,
  type ContextOptions,
  type ContextResponse,
} from './context-service';

// Fact Invalidation Service
export {
  FactInvalidationService,
  createFactInvalidationService,
  type InvalidationResult,
  type ConflictResolution,
  type InvalidationRecord,
} from './fact-invalidation';

// Temporal Query Service
export {
  TemporalQueryService,
  createTemporalQueryService,
  type TemporalFilter,
  type TemporalSearchOptions,
  type TemporalSearchResult,
  type TimelineEntry,
} from './temporal-query';

// Recall Benchmark Service
export {
  RecallBenchmarkService,
  createRecallBenchmarkService,
  type BenchmarkConfig,
  type RecallResult,
  type BenchmarkReport,
} from './recall-benchmark';
