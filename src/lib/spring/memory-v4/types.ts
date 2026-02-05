/**
 * Memory v4 Types (Mem0-Inspired)
 *
 * Comprehensive types for ingestion controls, advanced filtering,
 * multimodal support, and async job processing.
 */

// =============================================================================
// Ingestion Control Types
// =============================================================================

/** Actions for ingestion rules */
export type IngestionAction = 'store' | 'redact' | 'deny' | 'store_as_candidate';

/** Strictness levels for memory ingestion */
export type StrictnessLevel = 'low' | 'medium' | 'high' | 'very_high';

/** Map strictness to confidence thresholds */
export const STRICTNESS_THRESHOLDS: Record<StrictnessLevel, number> = {
  low: 0.5,
  medium: 0.75,
  high: 0.9,
  very_high: 0.95,
};

/** Memory categories for filtering */
export type MemoryCategory =
  | 'general'
  | 'personal'
  | 'work'
  | 'health'
  | 'finance'
  | 'auth'
  | 'secrets'
  | 'research'
  | 'writing'
  | 'code'
  | 'preferences'
  | 'relationships';

/** Ingestion rule definition */
export interface IngestionRule {
  id: string;
  userId: string;
  workspaceId?: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;

  // Scope filters
  namespace?: string;
  agentId?: string;

  // Content filters
  noteTypes?: string[];
  categories?: string[];
  tagPatterns?: string[];
  contentPatterns?: string[];

  // Confidence control
  confidenceThreshold: number;

  // Action
  action: IngestionAction;
  redactReplacement?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** User's global ingestion settings */
export interface IngestionSettings {
  userId: string;
  autoSaveEnabled: boolean;
  candidateModeEnabled: boolean;
  defaultConfidenceThreshold: number;
  strictness: StrictnessLevel;
  blockedCategories: string[];
  blockedPatterns: string[];
  sensitiveCapsuleEnabled: boolean;
  sensitiveCategories: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

/** Input for creating/updating ingestion rule */
export interface IngestionRuleInput {
  name: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  workspaceId?: string;
  namespace?: string;
  agentId?: string;
  noteTypes?: string[];
  categories?: string[];
  tagPatterns?: string[];
  contentPatterns?: string[];
  confidenceThreshold?: number;
  action: IngestionAction;
  redactReplacement?: string;
  metadata?: Record<string, unknown>;
}

/** Input for updating ingestion settings */
export interface IngestionSettingsInput {
  autoSaveEnabled?: boolean;
  candidateModeEnabled?: boolean;
  defaultConfidenceThreshold?: number;
  strictness?: StrictnessLevel;
  blockedCategories?: string[];
  blockedPatterns?: string[];
  sensitiveCapsuleEnabled?: boolean;
  sensitiveCategories?: string[];
}

/** Result of applying ingestion rules */
export interface IngestionDecision {
  action: IngestionAction;
  ruleId?: string;
  ruleName?: string;
  confidence: number;
  confidenceThreshold: number;
  redactedContent?: string;
  redactedFields?: string[];
  reason: string;
}

// =============================================================================
// Advanced Filter Types
// =============================================================================

/** Comparison operators for filters */
export type FilterOperator = 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex';

/** Single filter condition */
export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/** Logical filter group */
export interface FilterGroup {
  and?: (FilterCondition | FilterGroup)[];
  or?: (FilterCondition | FilterGroup)[];
  not?: FilterCondition | FilterGroup;
}

/** Time range filter */
export interface TimeFilter {
  since?: string | Date;
  until?: string | Date;
}

/** Complete search filters */
export interface SearchFiltersV3 {
  types?: string[];
  categories?: string[];
  tags?: string[];
  privacyClasses?: string[];
  statuses?: string[];
  agentId?: string;
  namespace?: string;
  time?: TimeFilter;
  includeExpired?: boolean;
  logic?: FilterGroup;
  /** Filter by language (BCP-47 code) */
  language?: string;
}

/** Search v3 request */
export interface SearchV3Request {
  query: string;
  scope?: 'user' | 'workspace' | 'org';
  filters?: SearchFiltersV3;
  mode?: 'semantic' | 'keyword' | 'hybrid' | 'advanced';
  topK?: number;
  rerank?: boolean;
  expandQuery?: boolean;
  includeUsage?: boolean;
}

/** Search v3 result item */
export interface SearchV3Result {
  id: string;
  content: string;
  type: string;
  status: string;
  category?: string;
  tags: string[];
  privacyClass: string;
  metadata?: Record<string, unknown>;
  extractionConfidence?: number;
  createdAt: Date;
  updatedAt: Date;
  validUntil?: Date;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
  rerankScore?: number;
  usageCount?: number;
  lastUsedAt?: Date;
  /** Detected language of the memory */
  language?: string;
  /** How the result was matched: direct embedding or canonical translation */
  searchMode?: 'direct' | 'canonical';
  /** Which representation matched (for explain mode) */
  matchedBy?: 'dense' | 'lexical' | 'both';
  /** Which text representation matched */
  matchedRepr?: 'raw' | 'normalized' | 'canonical' | 'romanized';
}

/** Search v3 response */
export interface SearchV3Response {
  results: SearchV3Result[];
  total: number;
  queryExpansion?: {
    original: string;
    expanded: string[];
    synonyms: string[];
    entities: string[];
  };
  filters: SearchFiltersV3;
  mode: string;
  processingMs: number;
}

// =============================================================================
// Multimodal / Asset Types
// =============================================================================

/** Storage provider for assets */
export type StorageProvider = 'r2' | 's3' | 'local';

/** Asset processing status */
export type AssetStatus = 'pending' | 'processing' | 'processed' | 'failed';

/** Asset relation to note */
export type AssetRelation = 'source' | 'attachment' | 'reference' | 'derived';

/** Asset record */
export interface Asset {
  id: string;
  userId: string;
  storageProvider: StorageProvider;
  storageKey: string;
  filename?: string;
  mimeType: string;
  sizeBytes?: number;
  sha256Hash: string;
  status: AssetStatus;
  processingError?: string;
  extractedText?: string;
  extractedMetadata?: Record<string, unknown>;
  createdAt: Date;
  processedAt?: Date;
}

/** Asset link to note */
export interface AssetLink {
  id: string;
  noteId: string;
  assetId: string;
  relation: AssetRelation;
  positionInfo?: {
    page?: number;
    bbox?: [number, number, number, number];
    region?: string;
  };
  createdAt: Date;
}

/** Input for multimodal ingestion */
export interface MultimodalIngestionInput {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  filename?: string;
  extractionPrompt?: string;
  noteType?: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Result of multimodal ingestion */
export interface MultimodalIngestionResult {
  assetId: string;
  noteIds: string[];
  extractedText: string;
  extractedFacts: Array<{
    content: string;
    type: string;
    confidence: number;
  }>;
  processingMs: number;
}

// =============================================================================
// Memory Usage Types
// =============================================================================

/** Usage type for memory tracking */
export type UsageType = 'recalled' | 'cited' | 'influenced' | 'rejected';

/** Outcome of memory usage */
export type UsageOutcome = 'success' | 'failure' | 'unknown';

/** Feedback type */
export type UsageFeedback = 'positive' | 'negative' | 'neutral';

/** Memory usage record */
export interface MemoryUsage {
  id: string;
  noteId: string;
  traceId?: string;
  spanId?: string;
  sessionId?: string;
  agentId?: string;
  usageType: UsageType;
  relevanceScore?: number;
  outcome?: UsageOutcome;
  feedback?: UsageFeedback;
  feedbackReason?: string;
  queryText?: string;
  responseSnippet?: string;
  createdAt: Date;
}

/** Input for recording usage */
export interface RecordUsageInput {
  noteId: string;
  usageType: UsageType;
  traceId?: string;
  spanId?: string;
  sessionId?: string;
  agentId?: string;
  relevanceScore?: number;
  queryText?: string;
  responseSnippet?: string;
}

/** Input for updating usage outcome */
export interface UpdateUsageOutcomeInput {
  usageId: string;
  outcome: UsageOutcome;
  feedback?: UsageFeedback;
  feedbackReason?: string;
}

/** Usage statistics for a note */
export interface NoteUsageStats {
  noteId: string;
  totalUsages: number;
  recallCount: number;
  citedCount: number;
  successRate: number;
  positiveRate: number;
  negativeRate: number;
  lastUsedAt?: Date;
  avgRelevanceScore?: number;
}

// =============================================================================
// Async Job Types
// =============================================================================

/** Job types */
export type JobType =
  | 'ingest'
  | 'ingest_multimodal'
  | 'consolidate'
  | 'distill'
  | 'export'
  | 'bulk_update'
  | 'bulk_delete'
  | 'link_generation'
  | 'note_builder'
  | 'tier_rebalance'
  | 'community_detection';

/** Job status */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Async job record */
export interface Job {
  id: string;
  userId: string;
  jobType: JobType;
  status: JobStatus;
  inputData: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  totalItems?: number;
  processedItems: number;
  failedItems: number;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

/** Input for creating a job */
export interface CreateJobInput {
  jobType: JobType;
  inputData: Record<string, unknown>;
  totalItems?: number;
  maxRetries?: number;
}

/** Job progress update */
export interface JobProgress {
  processedItems: number;
  failedItems?: number;
  outputData?: Record<string, unknown>;
}

// =============================================================================
// Export Types
// =============================================================================

/** Export output format */
export type ExportFormat = 'json' | 'jsonl' | 'csv' | 'markdown';

/** Export template */
export interface ExportTemplate {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  outputSchema: Record<string, unknown>;
  fieldMappings: Record<string, string>;
  outputFormat: ExportFormat;
  includeMetadata: boolean;
  includeProvenance: boolean;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Export request */
export interface ExportRequest {
  filters?: SearchFiltersV3;
  templateId?: string;
  format?: ExportFormat;
  includeMetadata?: boolean;
  includeProvenance?: boolean;
  includeMindmap?: boolean;
  signExport?: boolean;
}

/** Export result */
export interface ExportResult {
  jobId: string;
  status: JobStatus;
  downloadUrl?: string;
  expiresAt?: Date;
  recordCount?: number;
  fileSizeBytes?: number;
  signature?: string;
}

// =============================================================================
// Semantic Update Types
// =============================================================================

/** Update classification */
export type UpdateClassification = 'update' | 'merge' | 'supersede' | 'contradict' | 'no_change';

/** Semantic update request */
export interface SemanticUpdateRequest {
  statement: string;
  scope?: 'user' | 'workspace';
  filters?: SearchFiltersV3;
  autoApply?: boolean;
  dryRun?: boolean;
}

/** Semantic update candidate */
export interface UpdateCandidate {
  noteId: string;
  content: string;
  classification: UpdateClassification;
  confidence: number;
  suggestedContent?: string;
  explanation: string;
}

/** Semantic update result */
export interface SemanticUpdateResult {
  statement: string;
  candidates: UpdateCandidate[];
  appliedChanges: Array<{
    noteId: string;
    action: UpdateClassification;
    edgeId?: string;
  }>;
  dryRun: boolean;
  processingMs: number;
}

// =============================================================================
// Query Expansion Types
// =============================================================================

/** Query expansion result */
export interface QueryExpansion {
  originalQuery: string;
  expandedTerms: string[];
  synonyms: Array<{
    term: string;
    synonyms: string[];
  }>;
  entities: Array<{
    text: string;
    type: string;
    aliases: string[];
  }>;
  suggestedFilters?: SearchFiltersV3;
}

// =============================================================================
// Scope & Namespace Clarification
// =============================================================================
//
// The Spring Memory system uses two related but distinct concepts:
//
// 1. SCOPE (Database: spring_memory_notes.scope)
//    - Defines the visibility/ownership level of a memory
//    - Values: 'user' | 'workspace' | 'org' | 'session' | 'agent'
//    - Used for access control and RLS policies
//
// 2. NAMESPACE (Database: spring_memory_candidates.namespace)
//    - A logical grouping/partition identifier
//    - Values: Any string, default 'default'
//    - Used for organizing memories into categories
//
// API PARAMETER MAPPING:
// - When filtering spring_memory_notes: 'namespace' filter → 'scope' column
//   (This is because v3 notes don't have a namespace column)
// - When filtering spring_memory_candidates: 'namespace' filter → 'namespace' column
//
// =============================================================================

/** Memory scope determines visibility and access control */
export type MemoryScope = 'user' | 'workspace' | 'org' | 'session' | 'agent';

/** Memory note types for classification */
export type MemoryNoteType =
  | 'fact'
  | 'preference'
  | 'instruction'
  | 'episode'
  | 'procedure'
  | 'relationship';

/** Memory status lifecycle */
export type MemoryStatus =
  | 'candidate'
  | 'active'
  | 'superseded'
  | 'contradicted'
  | 'deleted';

/** Candidate review actions */
export type CandidateAction =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'redacted'
  | 'merged';

/** Edge relationship types */
export type EdgeType =
  | 'relates_to'
  | 'supports'
  | 'contradicts'
  | 'supersedes'
  | 'derived_from'
  | 'mentions'
  | 'part_of'
  | 'causes'
  | 'similar_to'
  | 'no_relationship';

/** Privacy classification levels */
export type PrivacyClass = 'public' | 'internal' | 'confidential' | 'restricted';

// =============================================================================
// Database Column Mapping (v3 Schema)
// =============================================================================

/**
 * Maps API/service field names to v3 database column names
 *
 * spring_memory_notes (v3):
 * - content (not 'note')
 * - note_type (not 'type')
 * - confidence (not 'confidence_score')
 * - payload_json (not 'metadata')
 * - scope (for visibility)
 *
 * spring_memory_candidates (supplement):
 * - content
 * - note_type
 * - namespace (logical partition)
 * - scope (visibility level)
 * - metadata (JSONB)
 *
 * spring_memory_edges (supplement):
 * - src_memory_id
 * - dst_memory_id
 * - edge_type
 */
export const DB_COLUMN_MAP = {
  // API field → DB column for spring_memory_notes
  notes: {
    content: 'content',
    noteType: 'note_type',
    confidence: 'confidence',
    metadata: 'payload_json',
    scope: 'scope',
    status: 'status',
    privacyClass: 'privacy_class',
  },

  // API field → DB column for spring_memory_candidates
  candidates: {
    content: 'content',
    noteType: 'note_type',
    confidence: 'confidence',
    metadata: 'metadata',
    namespace: 'namespace',
    scope: 'scope',
    action: 'action',
  },

  // API field → DB column for spring_memory_edges
  edges: {
    srcMemoryId: 'src_memory_id',
    dstMemoryId: 'dst_memory_id',
    edgeType: 'edge_type',
    weight: 'weight',
    createdBy: 'created_by',
    createdByAgent: 'created_by_agent',
    createdBySystem: 'created_by_system',
  },
} as const;

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Standard error codes for Spring Memory API
 */
export const ERROR_CODES = {
  // Validation errors
  INVALID_BODY: 'INVALID_BODY',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_VALUE: 'INVALID_VALUE',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  ALREADY_PROCESSED: 'ALREADY_PROCESSED',

  // Authorization errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  OWNERSHIP_REQUIRED: 'OWNERSHIP_REQUIRED',

  // Operation errors
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  OPERATION_FAILED: 'OPERATION_FAILED',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
