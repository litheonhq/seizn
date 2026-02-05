/**
 * Memory v3 Types
 * Comprehensive TypeScript types for the Memory v3 system
 */

// =============================================================================
// Note Types
// =============================================================================

/** Classification of note content type */
export type NoteType =
  | 'fact'
  | 'preference'
  | 'instruction'
  | 'episode'
  | 'procedure'
  | 'relationship';

/** Lifecycle status of a memory note */
export type NoteStatus =
  | 'candidate'
  | 'active'
  | 'superseded'
  | 'contradicted'
  | 'deleted';

/** Privacy classification for access control */
export type PrivacyClass =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted';

/** Scope defining the visibility/applicability of a note */
export type NoteScope =
  | 'user'
  | 'workspace'
  | 'org'
  | 'session'
  | 'agent';

// =============================================================================
// Edge Types
// =============================================================================

/** Types of relationships between notes */
export type EdgeType =
  | 'similar'
  | 'supersedes'
  | 'contradicts'
  | 'derived_from'
  | 'mentions_entity'
  | 'part_of_cluster';

// =============================================================================
// Provenance Types
// =============================================================================

/** Source information for how content was extracted */
export interface ExtractionSource {
  /** Type of source (e.g., 'conversation', 'document', 'api', 'user_input') */
  type: string;
  /** Unique identifier for the source */
  sourceId?: string;
  /** URL or path to the source */
  sourceUrl?: string;
  /** Timestamp when extraction occurred */
  extractedAt: Date;
  /** Method used for extraction */
  extractionMethod?: string;
  /** Confidence score of extraction (0-1) */
  extractionConfidence?: number;
  /** Raw text or content that was extracted from */
  rawContent?: string;
  /** Character or token offset in source */
  offset?: {
    start: number;
    end: number;
  };
}

/** Complete provenance information for a note */
export interface ProvenanceInfo {
  /** Primary extraction source */
  source: ExtractionSource;
  /** Additional sources that corroborate this information */
  corroboratingSources?: ExtractionSource[];
  /** Agent or system that created the note */
  createdBy: string;
  /** Model or version used for extraction */
  modelVersion?: string;
  /** Any transformations applied to the content */
  transformations?: string[];
  /** Chain of custody for the information */
  derivationChain?: string[];
}

// =============================================================================
// Scoring Types
// =============================================================================

/** Salience score indicating importance/relevance */
export interface SalienceScore {
  /** Overall salience score (0-1) */
  score: number;
  /** Recency factor contribution */
  recencyFactor?: number;
  /** Frequency of access/use factor */
  frequencyFactor?: number;
  /** Semantic relevance factor */
  relevanceFactor?: number;
  /** User-defined importance boost */
  importanceBoost?: number;
  /** Timestamp of last score calculation */
  calculatedAt: Date;
}

/** Utility score for retrieval ranking */
export interface UtilityScore {
  /** Overall utility score (0-1) */
  score: number;
  /** How often this note has been useful */
  usageCount: number;
  /** Success rate when this note was retrieved */
  successRate?: number;
  /** Average feedback score from usage */
  feedbackScore?: number;
  /** Context-specific utility adjustments */
  contextualAdjustments?: Record<string, number>;
  /** Decay factor based on staleness */
  decayFactor?: number;
}

// =============================================================================
// Entity Types
// =============================================================================

/** An entity mentioned or referenced in notes */
export interface Entity {
  /** Unique identifier for the entity */
  id: string;
  /** Canonical name of the entity */
  name: string;
  /** Type/category of entity (e.g., 'person', 'organization', 'concept') */
  type: string;
  /** Alternative names or aliases */
  aliases?: string[];
  /** Additional properties about the entity */
  properties?: Record<string, unknown>;
  /** When the entity was first seen */
  createdAt: Date;
  /** When the entity was last updated */
  updatedAt: Date;
  /** Number of times this entity is mentioned */
  mentionCount?: number;
}

/** A mention of an entity within a note */
export interface EntityMention {
  /** Reference to the entity */
  entityId: string;
  /** The entity details (when populated) */
  entity?: Entity;
  /** The exact text that mentioned the entity */
  mentionText: string;
  /** Position in the note content */
  position?: {
    start: number;
    end: number;
  };
  /** Confidence of entity recognition (0-1) */
  confidence?: number;
  /** Role or relationship type in context */
  role?: string;
}

// =============================================================================
// Main Interfaces
// =============================================================================

/** Complete memory note with all fields */
export interface MemoryNote {
  /** Unique identifier */
  id: string;
  /** The actual content/text of the note */
  content: string;
  /** Classification of the note type */
  type: NoteType;
  /** Current lifecycle status */
  status: NoteStatus;
  /** Visibility/applicability scope */
  scope: NoteScope;
  /** Privacy classification */
  privacyClass: PrivacyClass;

  /** User who owns this note */
  userId: string;
  /** Workspace context (if applicable) */
  workspaceId?: string;
  /** Organization context (if applicable) */
  orgId?: string;
  /** Session context (if applicable) */
  sessionId?: string;
  /** Agent that created/manages this note */
  agentId?: string;

  /** Vector embedding for semantic search */
  embedding?: number[];
  /** Dimension of the embedding vector */
  embeddingDimension?: number;
  /** Model used to generate embedding */
  embeddingModel?: string;

  /** Salience scoring information */
  salience?: SalienceScore;
  /** Utility scoring information */
  utility?: UtilityScore;

  /** Source and extraction information */
  provenance: ProvenanceInfo;

  /** Entities mentioned in this note */
  entityMentions?: EntityMention[];

  /** Free-form tags for categorization */
  tags?: string[];
  /** Structured metadata */
  metadata?: Record<string, unknown>;

  /** When the note was created */
  createdAt: Date;
  /** When the note was last updated */
  updatedAt: Date;
  /** When the note expires (if applicable) */
  expiresAt?: Date;
  /** Version number for optimistic locking */
  version: number;

  /** ID of note this supersedes (if status is 'active' and replaced another) */
  supersedesId?: string;
  /** ID of note that contradicts this (if status is 'contradicted') */
  contradictedById?: string;
}

/** Input for creating a new memory note */
export interface MemoryNoteInput {
  /** The actual content/text of the note */
  content: string;
  /** Classification of the note type */
  type: NoteType;
  /** Visibility/applicability scope */
  scope: NoteScope;
  /** Privacy classification (defaults to 'internal') */
  privacyClass?: PrivacyClass;

  /** User who owns this note */
  userId: string;
  /** Workspace context (if applicable) */
  workspaceId?: string;
  /** Organization context (if applicable) */
  orgId?: string;
  /** Session context (if applicable) */
  sessionId?: string;
  /** Agent that created/manages this note */
  agentId?: string;

  /** Pre-computed embedding (if available) */
  embedding?: number[];
  /** Model used for embedding (required if embedding provided) */
  embeddingModel?: string;

  /** Initial importance boost */
  importanceBoost?: number;

  /** Source and extraction information */
  provenance: Omit<ProvenanceInfo, 'createdBy'> & { createdBy?: string };

  /** Entity mentions to link */
  entityMentions?: Omit<EntityMention, 'entity'>[];

  /** Free-form tags for categorization */
  tags?: string[];
  /** Structured metadata */
  metadata?: Record<string, unknown>;

  /** When the note should expire */
  expiresAt?: Date;
}

/** Edge connecting two notes */
export interface MemoryEdge {
  /** Unique identifier */
  id: string;
  /** Source note ID */
  sourceId: string;
  /** Target note ID */
  targetId: string;
  /** Type of relationship */
  type: EdgeType;
  /** Strength/confidence of the relationship (0-1) */
  weight: number;
  /** Additional properties about the relationship */
  properties?: Record<string, unknown>;
  /** When the edge was created */
  createdAt: Date;
  /** When the edge was last updated */
  updatedAt: Date;
  /** Whether this edge was auto-generated or manual */
  isAutoGenerated: boolean;
}

/** Input for creating a new edge */
export interface MemoryEdgeInput {
  /** Source note ID */
  sourceId: string;
  /** Target note ID */
  targetId: string;
  /** Type of relationship */
  type: EdgeType;
  /** Strength/confidence of the relationship (0-1) */
  weight?: number;
  /** Additional properties about the relationship */
  properties?: Record<string, unknown>;
  /** Whether this edge was auto-generated */
  isAutoGenerated?: boolean;
}

/** A candidate note pending verification */
export interface MemoryCandidate {
  /** The candidate note */
  note: MemoryNote;
  /** Reason the note is a candidate */
  candidateReason: string;
  /** Confidence in the extraction (0-1) */
  extractionConfidence: number;
  /** Similar existing notes that might conflict */
  similarNotes?: Array<{
    note: MemoryNote;
    similarity: number;
  }>;
  /** Suggested actions */
  suggestedActions?: Array<{
    action: 'approve' | 'reject' | 'merge' | 'edit';
    reason: string;
    mergeTargetId?: string;
  }>;
  /** When the candidate was created */
  createdAt: Date;
  /** Deadline for automatic action */
  autoActionAt?: Date;
  /** Automatic action to take if not reviewed */
  autoAction?: 'approve' | 'reject';
}

/** Verification record for a candidate */
export interface MemoryVerification {
  /** Unique identifier */
  id: string;
  /** ID of the candidate note */
  candidateId: string;
  /** Verification decision */
  decision: 'approved' | 'rejected' | 'merged' | 'edited';
  /** Who made the verification */
  verifiedBy: string;
  /** Whether it was auto-verified */
  isAutoVerified: boolean;
  /** Reason for the decision */
  reason?: string;
  /** If merged, the target note ID */
  mergedIntoId?: string;
  /** If edited, the changes made */
  edits?: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
  /** When verification occurred */
  verifiedAt: Date;
}

// =============================================================================
// Query Types
// =============================================================================

/** Query parameters for filtering/searching notes */
export interface NoteQuery {
  /** Filter by note IDs */
  ids?: string[];
  /** Filter by user ID */
  userId?: string;
  /** Filter by workspace ID */
  workspaceId?: string;
  /** Filter by organization ID */
  orgId?: string;
  /** Filter by session ID */
  sessionId?: string;
  /** Filter by agent ID */
  agentId?: string;

  /** Filter by note types */
  types?: NoteType[];
  /** Filter by statuses */
  statuses?: NoteStatus[];
  /** Filter by scopes */
  scopes?: NoteScope[];
  /** Filter by privacy classes */
  privacyClasses?: PrivacyClass[];

  /** Semantic search query */
  semanticQuery?: string;
  /** Pre-computed query embedding */
  queryEmbedding?: number[];
  /** Minimum similarity threshold for semantic search (0-1) */
  similarityThreshold?: number;

  /** Full-text search query */
  textQuery?: string;

  /** Filter by tags (any match) */
  tagsAny?: string[];
  /** Filter by tags (all must match) */
  tagsAll?: string[];

  /** Filter by entity IDs mentioned */
  mentionsEntities?: string[];

  /** Filter by creation date range */
  createdAfter?: Date;
  createdBefore?: Date;
  /** Filter by update date range */
  updatedAfter?: Date;
  updatedBefore?: Date;

  /** Minimum salience score */
  minSalience?: number;
  /** Minimum utility score */
  minUtility?: number;

  /** Include expired notes */
  includeExpired?: boolean;

  /** Sorting options */
  sortBy?: 'createdAt' | 'updatedAt' | 'salience' | 'utility' | 'similarity';
  sortOrder?: 'asc' | 'desc';

  /** Pagination */
  limit?: number;
  offset?: number;
  cursor?: string;

  /** Fields to include/exclude */
  includeEmbedding?: boolean;
  includeProvenance?: boolean;
  includeEntityMentions?: boolean;
}

/** Query parameters for filtering edges */
export interface EdgeQuery {
  /** Filter by edge IDs */
  ids?: string[];
  /** Filter by source note ID */
  sourceId?: string;
  /** Filter by target note ID */
  targetId?: string;
  /** Filter by either source or target */
  noteId?: string;
  /** Filter by edge types */
  types?: EdgeType[];
  /** Minimum weight threshold */
  minWeight?: number;
  /** Include auto-generated edges */
  includeAutoGenerated?: boolean;

  /** Pagination */
  limit?: number;
  offset?: number;
}

/** Query for generating a mind map view */
export interface MindMapQuery {
  /** Central note ID to start from */
  centerId?: string;
  /** Central entity ID to start from */
  centerEntityId?: string;
  /** Semantic query to find center */
  semanticQuery?: string;

  /** User context */
  userId: string;
  /** Workspace context */
  workspaceId?: string;

  /** Maximum depth of traversal */
  maxDepth?: number;
  /** Maximum nodes to return */
  maxNodes?: number;
  /** Edge types to follow */
  edgeTypes?: EdgeType[];
  /** Note types to include */
  noteTypes?: NoteType[];
  /** Minimum edge weight to follow */
  minEdgeWeight?: number;

  /** Include entity nodes */
  includeEntities?: boolean;
  /** Include cluster groupings */
  includeClusters?: boolean;
}

/** Node in a mind map response */
export interface MindMapNode {
  /** Node ID */
  id: string;
  /** Node type */
  type: 'note' | 'entity' | 'cluster';
  /** Display label */
  label: string;
  /** Full content (for notes) */
  content?: string;
  /** Note data (if type is 'note') */
  note?: MemoryNote;
  /** Entity data (if type is 'entity') */
  entity?: Entity;
  /** Cluster info (if type is 'cluster') */
  cluster?: {
    id: string;
    name: string;
    noteCount: number;
  };
  /** Distance from center (depth) */
  depth: number;
  /** Relevance score */
  relevance?: number;
}

/** Edge in a mind map response */
export interface MindMapEdge {
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Edge type */
  type: EdgeType | 'belongs_to';
  /** Edge weight */
  weight: number;
  /** Display label */
  label?: string;
}

/** Response from a mind map query */
export interface MindMapResponse {
  /** Nodes in the map */
  nodes: MindMapNode[];
  /** Edges connecting nodes */
  edges: MindMapEdge[];
  /** The central node ID */
  centerId: string;
  /** Statistics about the map */
  stats: {
    totalNotes: number;
    totalEntities: number;
    totalClusters: number;
    maxDepthReached: number;
    truncated: boolean;
  };
}

// =============================================================================
// Explain Types
// =============================================================================

/** Explanation of why a note was stored */
export interface ExplainStoredResponse {
  /** The note that was stored */
  note: MemoryNote;
  /** Why this content was deemed worth storing */
  reasoning: string;
  /** Key factors that influenced the decision */
  factors: Array<{
    factor: string;
    description: string;
    weight: number;
  }>;
  /** Similar notes that were considered */
  consideredSimilar: Array<{
    note: MemoryNote;
    similarity: number;
    decision: 'kept_both' | 'superseded' | 'merged';
    reason: string;
  }>;
  /** Entities that were extracted */
  extractedEntities: EntityMention[];
  /** Classification reasoning */
  classificationReasoning: {
    type: {
      chosen: NoteType;
      alternatives: Array<{ type: NoteType; confidence: number }>;
      reason: string;
    };
    scope: {
      chosen: NoteScope;
      reason: string;
    };
    privacy: {
      chosen: PrivacyClass;
      reason: string;
    };
  };
  /** Initial scores */
  initialScores: {
    salience: SalienceScore;
    utility: UtilityScore;
  };
}

/** Explanation of why notes were recalled for a query */
export interface ExplainRecalledResponse {
  /** The query that was executed */
  query: NoteQuery;
  /** Processing steps taken */
  processingSteps: Array<{
    step: string;
    description: string;
    duration: number;
    resultCount?: number;
  }>;
  /** Notes that were recalled with explanations */
  recalledNotes: Array<{
    note: MemoryNote;
    /** Why this note was recalled */
    reasoning: string;
    /** Relevance breakdown */
    relevanceFactors: Array<{
      factor: string;
      contribution: number;
      explanation: string;
    }>;
    /** Final relevance score */
    finalScore: number;
    /** Rank in results */
    rank: number;
  }>;
  /** Notes that were considered but filtered out */
  filteredNotes?: Array<{
    noteId: string;
    reason: string;
    score?: number;
  }>;
  /** Query understanding */
  queryUnderstanding: {
    /** Detected intent */
    intent: string;
    /** Key concepts extracted */
    keyConcepts: string[];
    /** Temporal scope detected */
    temporalScope?: string;
    /** Expanded query terms */
    expandedTerms?: string[];
  };
  /** Performance metrics */
  metrics: {
    totalConsidered: number;
    totalReturned: number;
    processingTime: number;
    embeddingTime?: number;
    searchTime?: number;
    rankingTime?: number;
  };
}

// =============================================================================
// Batch Operation Types
// =============================================================================

/** Result of a batch operation */
export interface BatchOperationResult<T> {
  /** Successfully processed items */
  succeeded: Array<{
    input: T;
    result: MemoryNote | MemoryEdge;
  }>;
  /** Failed items */
  failed: Array<{
    input: T;
    error: string;
    code?: string;
  }>;
  /** Summary statistics */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    processingTime: number;
  };
}

// =============================================================================
// Event Types
// =============================================================================

/** Events emitted by the memory system */
export type MemoryEvent =
  | { type: 'note_created'; note: MemoryNote }
  | { type: 'note_updated'; note: MemoryNote; changes: string[] }
  | { type: 'note_status_changed'; noteId: string; oldStatus: NoteStatus; newStatus: NoteStatus }
  | { type: 'note_deleted'; noteId: string }
  | { type: 'edge_created'; edge: MemoryEdge }
  | { type: 'edge_deleted'; edgeId: string }
  | { type: 'candidate_created'; candidate: MemoryCandidate }
  | { type: 'candidate_verified'; verification: MemoryVerification }
  | { type: 'entity_created'; entity: Entity }
  | { type: 'entity_merged'; sourceId: string; targetId: string };

/** Subscription to memory events */
export interface MemoryEventSubscription {
  /** Subscription ID */
  id: string;
  /** Event types to receive */
  eventTypes: MemoryEvent['type'][];
  /** Filter by user ID */
  userId?: string;
  /** Filter by workspace ID */
  workspaceId?: string;
  /** Callback URL for webhooks */
  callbackUrl?: string;
  /** Created timestamp */
  createdAt: Date;
}

// =============================================================================
// Configuration Types
// =============================================================================

/** Configuration for the memory system */
export interface MemoryConfig {
  /** Default embedding model to use */
  defaultEmbeddingModel: string;
  /** Embedding dimensions */
  embeddingDimensions: number;
  /** Default similarity threshold */
  defaultSimilarityThreshold: number;
  /** Auto-verification settings */
  autoVerification: {
    enabled: boolean;
    confidenceThreshold: number;
    delaySeconds: number;
  };
  /** Retention policies */
  retention: {
    defaultExpirationDays?: number;
    sessionNoteExpirationDays: number;
    candidateExpirationDays: number;
  };
  /** Scoring weights */
  scoring: {
    recencyWeight: number;
    frequencyWeight: number;
    relevanceWeight: number;
    utilityWeight: number;
  };
}
