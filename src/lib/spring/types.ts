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
