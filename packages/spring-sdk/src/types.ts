/**
 * Seizn Spring (Memory Layer) - Core Types
 *
 * Type definitions for the Spring Memory SDK.
 * These types define the wire format for SDK consumers.
 */

// ============================================
// Memory Types
// ============================================

export type MemoryType =
  | 'fact'           // Objective facts
  | 'preference'     // User preferences
  | 'experience'     // Events, experiences
  | 'relationship'   // Relationship information
  | 'instruction'    // Rules, instructions
  | 'conversation';  // Conversation context

export type MemoryScope = 'user' | 'session' | 'global' | 'project';

export interface Memory {
  id: string;
  content: string;
  memoryType: MemoryType;
  tags: string[];
  namespace: string;
  scope: MemoryScope;
  sessionId?: string;
  agentId?: string;
  source: string;
  confidence: number;
  importance: number;
  createdAt: string;
  updatedAt?: string;
  accessCount?: number;
  lastAccessedAt?: string;
}

export interface MemorySearchResult extends Memory {
  similarity: number;
  combinedScore?: number;
  keywordScore?: number;
}

// ============================================
// Request/Response Types
// ============================================

export interface AddMemoryRequest {
  content: string;
  memory_type?: MemoryType;
  tags?: string[];
  namespace?: string;
  scope?: MemoryScope;
  session_id?: string;
  agent_id?: string;
  source?: string;
}

export interface AddMemoryResponse {
  success: boolean;
  memory: Memory;
}

export type SearchMode = 'vector' | 'hybrid' | 'keyword';

export interface SearchMemoriesRequest {
  query: string;
  limit?: number;
  threshold?: number;
  namespace?: string;
  mode?: SearchMode;
  tags?: string[];
}

export interface SearchMemoriesResponse {
  success: boolean;
  mode: SearchMode;
  results: MemorySearchResult[];
  count: number;
}

export interface UpdateMemoryRequest {
  content?: string;
  memory_type?: MemoryType;
  tags?: string[];
  namespace?: string;
  importance?: number;
}

export interface UpdateMemoryResponse {
  success: boolean;
  memory: Memory;
}

export interface DeleteMemoriesRequest {
  ids: string[];
}

export interface DeleteMemoriesResponse {
  success: boolean;
  deleted: number;
}

// ============================================
// Export/Import Types
// ============================================

export interface MemoryExport {
  version: '1.0';
  exportedAt: string;
  userId: string;
  namespace?: string;
  memories: Memory[];
  count: number;
}

export interface MemoryImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

// ============================================
// SDK Configuration Types
// ============================================

export interface SpringClientConfig {
  apiKey: string;
  baseUrl?: string;
  namespace?: string;
  timeout?: number;
  retries?: number;
  onError?: (error: SpringError) => void;
}

export interface SpringError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

// ============================================
// Bulk Operations
// ============================================

export interface BulkAddRequest {
  memories: AddMemoryRequest[];
}

export interface BulkAddResponse {
  success: boolean;
  added: number;
  failed: number;
  errors?: Array<{ index: number; error: string }>;
}

// ============================================
// Analytics Types
// ============================================

export interface MemoryStats {
  totalMemories: number;
  byType: Record<MemoryType, number>;
  byNamespace: Record<string, number>;
  recentAccessCount: number;
  storageUsedMb: number;
}

export interface MemoryUsage {
  period: 'day' | 'week' | 'month';
  searches: number;
  additions: number;
  deletions: number;
  embeddingTokens: number;
}

// ============================================
// Graph Types
// ============================================

export type EdgeType =
  | 'relates_to'
  | 'supports'
  | 'contradicts'
  | 'supersedes'
  | 'derived_from'
  | 'mentions'
  | 'part_of'
  | 'causes'
  | 'similar_to';

export interface Edge {
  id: string;
  srcMemoryId: string;
  dstMemoryId: string;
  edgeType: EdgeType | string;
  weight: number;
  reason?: string;
  confidence?: number;
  direction: string;
  createdAt: string;
}

export interface CreateEdgeRequest {
  srcMemoryId: string;
  dstMemoryId: string;
  edgeType?: EdgeType | string;
  weight?: number;
  reason?: string;
  confidence?: number;
  agentId?: string;
}

export interface GraphNeighbor {
  memoryId: string;
  content: string;
  edgeType: string;
  weight: number;
  direction: string;
  hops: number;
}

export interface NeighborhoodRequest {
  memory_id: string;
  max_hops?: number;
  limit?: number;
  min_weight?: number;
  edge_types?: string[];
}

// ============================================
// Temporal Types
// ============================================

export interface TemporalSearchRequest {
  valid_at: string;
  query?: string;
  types?: string[];
  top_k?: number;
  min_similarity?: number;
  exclude_expired?: boolean;
  include_superseded?: boolean;
}

export interface TemporalResult {
  id: string;
  content: string;
  type: string;
  similarity: number | null;
  validFrom: string | null;
  validTo: string | null;
  eventTime: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface TemporalSearchResponse {
  success: boolean;
  results: TemporalResult[];
  count: number;
}

export interface TimelineEntry {
  id: string;
  content: string;
  type: string;
  eventTime: string;
  validFrom: string | null;
  validTo: string | null;
  isCurrentlyValid: boolean;
}

export interface TimelineResponse {
  success: boolean;
  entries: TimelineEntry[];
  count: number;
}

export interface FactHistoryEntry extends TemporalResult {
  supersededById: string | null;
}

export interface FactHistoryResponse {
  success: boolean;
  history: FactHistoryEntry[];
  count: number;
}

export interface ChangedFact {
  oldFact: Omit<TemporalResult, 'similarity' | 'metadata'>;
  newFact: Omit<TemporalResult, 'similarity' | 'metadata'>;
  changedAt: string;
}

export interface ChangedFactsResponse {
  success: boolean;
  changes: ChangedFact[];
  count: number;
}

export interface TemporalStatus {
  active: number;
  expired: number;
  superseded: number;
  expiringSoon: number;
  total: number;
}

export interface TemporalStatusResponse extends TemporalStatus {
  success: boolean;
}

// ============================================
// Ingestion Types
// ============================================

export type IngestionAction = 'store' | 'redact' | 'deny' | 'store_as_candidate';
export type StrictnessLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface IngestionRule {
  id: string;
  name: string;
  action: IngestionAction | string;
  description?: string;
  priority: number;
  enabled: boolean;
  workspaceId?: string;
  namespace?: string;
  agentId?: string;
  noteTypes?: string[];
  categories?: string[];
  tagPatterns?: string[];
  contentPatterns?: string[];
  confidenceThreshold: number;
  redactReplacement?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateIngestionRuleRequest {
  name: string;
  action: IngestionAction | string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  workspace_id?: string;
  namespace?: string;
  agent_id?: string;
  note_types?: string[];
  categories?: string[];
  tag_patterns?: string[];
  content_patterns?: string[];
  confidence_threshold?: number;
  redact_replacement?: string;
}

export interface IngestionSettings {
  autoSaveEnabled: boolean;
  candidateModeEnabled: boolean;
  defaultConfidenceThreshold: number;
  strictness: StrictnessLevel | string;
  blockedCategories: string[];
  blockedPatterns: string[];
  sensitiveCapsuleEnabled: boolean;
  sensitiveCategories: string[];
}
