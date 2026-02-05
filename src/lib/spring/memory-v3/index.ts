/**
 * Memory v3 Module
 *
 * Comprehensive memory system with typed notes, knowledge graph,
 * contradiction detection, and advanced features.
 *
 * @module spring/memory-v3
 */

// Types
export * from './types';

// Core Service
export { MemoryV3Service } from './service';

// Contradiction Engine
export { ContradictionEngine } from './contradiction-engine';
export type { RelationAnalysis, ContradictionSummary, RelationType, NoteUpdate } from './contradiction-engine';

// Memory Distillation
export { DistillationService, createDistillationService } from './distillation';
export type { Cluster, DistillationResult, DistillationLog, DistillationConfig } from './distillation';

// Utility Scorer
export { UtilityScorerService, createUtilityScorerService } from './utility-scorer';
export type { UsageSignal, FeedbackRecord, UtilityReport, UtilityScorerConfig } from './utility-scorer';

// Context Packer
export { ContextPackerService, createContextPackerService } from './context-packer';
export type { PackingStrategy, PackedContext, PackingOptions, ContextPackerConfig } from './context-packer';
