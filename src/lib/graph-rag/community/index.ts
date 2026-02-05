/**
 * Graph Community Module
 *
 * Hierarchical community detection and summarization for GraphRAG.
 *
 * @module graph-rag/community
 */

// Community Detection
export {
  CommunityDetectionService,
  createCommunityDetectionService,
  type CommunityDetectionConfig,
  type Community,
  type DetectionResult,
} from './detection';

// Community Summary
export {
  CommunitySummaryService,
  createCommunitySummaryService,
  type CommunitySummary,
  type SummaryConfig,
  type SearchResult,
} from './summary';
