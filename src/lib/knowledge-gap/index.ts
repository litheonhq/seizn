/**
 * Knowledge Gap Filler
 *
 * Auto-detect missing information when retrieval fails
 * and suggest actions to fill the gap.
 */

// Types
export * from './types';

// Core functionality
export {
  analyzeKnowledgeGap,
  shouldAnalyzeForGaps,
  DEFAULT_GAP_CONFIG,
} from './analyzer';

export {
  extractMissingEntities,
  extractAllEntities,
} from './entity-extractor';

export {
  suggestSources,
  generateActionableSuggestions,
} from './source-suggester';

// Database operations
export {
  createKnowledgeGap,
  findSimilarGap,
  recordGapOccurrence,
  getKnowledgeGap,
  listKnowledgeGaps,
  updateKnowledgeGap,
  getGapStatistics,
  createGapFillingAction,
  getGapActions,
  updateActionStatus,
  executeAction,
} from './filler';
