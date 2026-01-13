/**
 * Knowledge Gap Filler Types
 *
 * Types for detecting missing information when retrieval fails
 * and suggesting actions to fill the gaps.
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Types of knowledge gaps that can be detected
 */
export type GapType =
  | 'missing_entity'    // Query mentions entities not found in corpus
  | 'missing_table'     // Query requests tabular data not present
  | 'outdated_doc'      // Query references recent events, docs are old
  | 'permission_denied' // Results exist but filtered by permissions
  | 'coverage_gap'      // Topic exists but insufficient depth
  | 'domain_mismatch';  // Query domain differs from collection focus

/**
 * Status of a knowledge gap
 */
export type GapStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';

/**
 * Types of actions that can fill a gap
 */
export type ActionType =
  | 'ingest_url'      // Crawl and index a URL
  | 'ingest_file'     // Upload and index a file
  | 'connect_source'  // Add a federated source
  | 'request_access'  // Request permission to existing doc
  | 'ignore';         // Mark as not actionable

/**
 * Status of a filling action
 */
export type ActionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// =============================================================================
// Entity Types
// =============================================================================

/**
 * Entity type for missing entities
 */
export type EntityType =
  | 'person'
  | 'organization'
  | 'product'
  | 'project'
  | 'date'
  | 'location'
  | 'event'
  | 'concept'
  | 'other';

/**
 * Missing entity detected in a query
 */
export interface MissingEntity {
  name: string;
  type: EntityType;
  confidence: number;
  context: string; // The surrounding text in the query
  aliases?: string[]; // Alternative names/spellings
}

// =============================================================================
// Source Suggestion Types
// =============================================================================

/**
 * Type of source that can fill a gap
 */
export type SuggestedSourceType =
  | 'web_url'
  | 'internal_doc'
  | 'api_connector'
  | 'manual_upload'
  | 'federated_source';

/**
 * Priority level for suggested sources
 */
export type SourcePriority = 'high' | 'medium' | 'low';

/**
 * Suggested source to fill a knowledge gap
 */
export interface SuggestedSource {
  sourceType: SuggestedSourceType;
  identifier: string; // URL, doc ID, or other identifier
  priority: SourcePriority;
  reason: string; // Why this source is suggested
  metadata?: {
    title?: string;
    domain?: string;
    estimatedRelevance?: number;
    lastCrawled?: string;
  };
}

// =============================================================================
// Related Document Types
// =============================================================================

/**
 * Document that partially matches the query
 */
export interface RelatedDoc {
  documentId: string;
  title?: string;
  similarity: number;
  missingAspects: string[]; // What the doc doesn't cover
  presentAspects: string[]; // What the doc does cover
}

// =============================================================================
// Knowledge Gap
// =============================================================================

/**
 * A detected knowledge gap
 */
export interface KnowledgeGap {
  id: string;
  userId: string;
  collectionId?: string;

  // Gap identification
  queryText: string;
  queryEmbedding?: number[];
  gapType: GapType;

  // Analysis results
  missingEntities: MissingEntity[];
  suggestedSources: SuggestedSource[];
  relatedDocs: RelatedDoc[];
  confidence: number;

  // Analysis metadata
  analysisVersion: string;
  analysisMetadata?: Record<string, unknown>;

  // Status
  status: GapStatus;
  resolutionAction?: string;
  resolutionNotes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for creating a knowledge gap
 */
export interface CreateGapParams {
  userId: string;
  collectionId?: string;
  queryText: string;
  queryEmbedding?: number[];
  gapType: GapType;
  missingEntities?: MissingEntity[];
  suggestedSources?: SuggestedSource[];
  relatedDocs?: RelatedDoc[];
  confidence?: number;
  analysisMetadata?: Record<string, unknown>;
}

/**
 * Parameters for updating a knowledge gap
 */
export interface UpdateGapParams {
  status?: GapStatus;
  resolutionAction?: string;
  resolutionNotes?: string;
  suggestedSources?: SuggestedSource[];
}

// =============================================================================
// Gap Filling Actions
// =============================================================================

/**
 * An action to fill a knowledge gap
 */
export interface GapFillingAction {
  id: string;
  gapId: string;
  actionType: ActionType;
  actionParams: ActionParams;
  status: ActionStatus;
  startedAt?: Date;
  completedAt?: Date;
  result?: ActionResult;
  error?: string;
  initiatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for different action types
 */
export type ActionParams =
  | IngestUrlParams
  | IngestFileParams
  | ConnectSourceParams
  | RequestAccessParams
  | IgnoreParams;

export interface IngestUrlParams {
  type: 'ingest_url';
  url: string;
  crawlDepth?: number;
  includeLinks?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IngestFileParams {
  type: 'ingest_file';
  filePath?: string;
  fileUrl?: string;
  fileName: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectSourceParams {
  type: 'connect_source';
  sourceType: 'http' | 'agent' | 'database';
  config: Record<string, unknown>;
  name: string;
}

export interface RequestAccessParams {
  type: 'request_access';
  documentIds: string[];
  requestReason: string;
  requestedPermission: 'read' | 'full';
}

export interface IgnoreParams {
  type: 'ignore';
  reason: string;
}

/**
 * Result of an action execution
 */
export interface ActionResult {
  resolved: boolean;
  documentsIndexed?: number;
  chunksCreated?: number;
  sourceConnected?: string;
  accessGranted?: boolean;
  notes?: string;
}

/**
 * Parameters for creating a gap filling action
 */
export interface CreateActionParams {
  gapId: string;
  actionType: ActionType;
  actionParams: ActionParams;
  initiatedBy?: string;
}

// =============================================================================
// Gap Analysis Types
// =============================================================================

/**
 * Result of analyzing a query for knowledge gaps
 */
export interface GapAnalysis {
  gapType: GapType;
  confidence: number;
  missingEntities: MissingEntity[];
  suggestedSources: SuggestedSource[];
  relatedDocs: RelatedDoc[];
  explanation: string;
  shouldCreateGap: boolean;
}

/**
 * Input for gap analysis
 */
export interface GapAnalysisInput {
  query: string;
  queryEmbedding: number[];
  retrievalResult: RetrievalResultForAnalysis;
  collectionId?: string;
  userId: string;
}

/**
 * Simplified retrieval result for gap analysis
 */
export interface RetrievalResultForAnalysis {
  results: Array<{
    chunkId: string;
    documentId: string;
    text: string;
    similarity: number;
    metadata?: Record<string, unknown>;
  }>;
  totalResults: number;
  filteredByPermission?: number;
}

// =============================================================================
// Gap Occurrence
// =============================================================================

/**
 * An occurrence of a knowledge gap
 */
export interface GapOccurrence {
  id: string;
  gapId: string;
  queryText: string;
  queryEmbedding?: number[];
  traceId?: string;
  sessionId?: string;
  occurredAt: Date;
}

// =============================================================================
// Statistics & Reporting
// =============================================================================

/**
 * Statistics for knowledge gaps
 */
export interface GapStatistics {
  totalGaps: number;
  openGaps: number;
  resolvedGaps: number;
  gapTypeCounts: Record<GapType, number>;
  avgResolutionTimeHours?: number;
  mostCommonEntities: Array<{
    name: string;
    count: number;
  }>;
}

/**
 * Trend data for gap analysis
 */
export interface GapTrend {
  date: string;
  newGaps: number;
  resolvedGaps: number;
  occurrences: number;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface GapListResponse {
  gaps: KnowledgeGap[];
  total: number;
  page: number;
  pageSize: number;
  statistics?: GapStatistics;
}

export interface GapResponse {
  gap: KnowledgeGap;
  occurrences?: number;
  actions?: GapFillingAction[];
}

export interface GapAnalysisResponse {
  analysis: GapAnalysis;
  existingGap?: KnowledgeGap;
  gapCreated?: KnowledgeGap;
}

export interface ActionListResponse {
  actions: GapFillingAction[];
  total: number;
}

export interface ActionResponse {
  action: GapFillingAction;
}

// =============================================================================
// Filter & Query Types
// =============================================================================

export interface GapFilter {
  status?: GapStatus | GapStatus[];
  gapType?: GapType | GapType[];
  collectionId?: string;
  minConfidence?: number;
  hasEntities?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface ActionFilter {
  status?: ActionStatus | ActionStatus[];
  actionType?: ActionType | ActionType[];
  createdAfter?: Date;
  createdBefore?: Date;
}

// =============================================================================
// Configuration
// =============================================================================

export interface KnowledgeGapConfig {
  // Analysis settings
  minResultsForGap: number; // Below this count, consider it a gap
  minSimilarityThreshold: number; // Results below this are weak
  deduplicationThreshold: number; // Similarity to consider gaps duplicates

  // Entity extraction
  entityExtractionEnabled: boolean;
  minEntityConfidence: number;

  // Source suggestion
  suggestWebSources: boolean;
  suggestInternalDocs: boolean;
  maxSuggestionsPerSource: number;

  // Auto-actions
  autoCreateGaps: boolean;
  autoSuggestSources: boolean;
}

export const DEFAULT_GAP_CONFIG: KnowledgeGapConfig = {
  minResultsForGap: 3,
  minSimilarityThreshold: 0.5,
  deduplicationThreshold: 0.92,
  entityExtractionEnabled: true,
  minEntityConfidence: 0.6,
  suggestWebSources: true,
  suggestInternalDocs: true,
  maxSuggestionsPerSource: 5,
  autoCreateGaps: true,
  autoSuggestSources: true,
};
