/**
 * Shared dashboard types
 *
 * Centralized type definitions used across dashboard pages.
 * Import from '@/types/dashboard' instead of defining inline.
 */

// ============================================
// User & Auth
// ============================================

export interface DashboardUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

// ============================================
// Stats (Overview)
// ============================================

export interface DashboardStats {
  memories: {
    count: number;
    limit: number;
    percentage: number;
  };
  apiCalls: {
    today: number;
    limit: number;
    percentage: number;
  };
  keys: number;
  plan: string;
  planDisplay: string;
}

export interface DailyUsage {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
}

export interface RecentActivity {
  id: string;
  endpoint: string;
  method: string;
  status: number;
  statusCategory: 'success' | 'redirect' | 'client_error' | 'server_error';
  latencyMs: number | null;
  costCents: number;
  keyPrefix: string;
  timestamp: string;
  tokens: number;
}

// ============================================
// Memories
// ============================================

export interface Memory {
  id: string;
  content: string;
  encrypted_content?: string | null;
  is_encrypted?: boolean;
  memory_type: string;
  tags: string[];
  namespace: string;
  similarity?: number;
  personalization_score?: number;
  created_at: string;
  updated_at?: string;
  importance?: number;
  source?: string;
  scope?: string;
  agent_id?: string;
  entity_id?: string;
  tier?: 'hot' | 'warm' | 'cold';
  pinned?: boolean;
  recall_count?: number;
  last_recalled_at?: string | null;
  size_bytes?: number;
}

export interface RecentMemory {
  id: string;
  content: string;
  memory_type: string;
  created_at: string;
}

export interface MemoriesResponse {
  success: boolean;
  results: Memory[];
  count: number;
  total: number;
  offset: number;
  limit: number;
  mode?: string;
  requestedMode?: string;
  cached?: boolean;
  semantic_cache?: {
    enabled: boolean;
    variant: 'control' | 'treatment' | null;
    scope: 'dashboard' | 'all';
    read_enabled: boolean;
    write_enabled: boolean;
    reason: string;
    bucket: number | null;
    hit: boolean;
  };
  fallback?: {
    applied: boolean;
    from: string;
    to: string;
    reason: string;
  } | null;
  routerDecision?: {
    strategy: string;
    confidence: number;
    reason: string;
  } | null;
  routerLearning?: {
    applied: boolean;
    reason: string;
    queryBucket?: string;
    statsAvailable?: boolean;
    sampleCount?: number;
    scoreDelta?: number;
  } | null;
  personalization?: {
    enabled: boolean;
    applied: boolean;
    available: boolean;
  };
}

export interface NamespaceInfo {
  name: string;
  count: number;
}

// ============================================
// API Keys
// ============================================

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

// ============================================
// Import/Export
// ============================================

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors?: string[];
}

// ============================================
// Sort
// ============================================

export type SortOption = 'date_desc' | 'date_asc' | 'importance' | 'relevance';
