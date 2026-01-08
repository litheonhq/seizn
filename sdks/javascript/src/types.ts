/**
 * Seizn SDK Type Definitions
 */

export type MemoryType = 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';
export type MemoryScope = 'user' | 'session' | 'agent';
export type SearchMode = 'vector' | 'keyword' | 'hybrid';
export type WebhookEvent = 'memory.created' | 'memory.updated' | 'memory.deleted';

export interface Memory {
  id: string;
  content: string;
  memory_type: MemoryType;
  tags: string[];
  namespace: string;
  scope?: MemoryScope;
  importance: number;
  confidence: number;
  created_at: string;
  updated_at?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  memory_type: MemoryType;
  tags: string[];
  similarity: number;
  keyword_rank?: number;
  combined_score?: number;
}

export interface ExtractedMemory {
  content: string;
  memory_type: MemoryType;
  tags: string[];
  confidence: number;
  importance: number;
}

export interface QueryResponse {
  response: string;
  memories_used?: Array<{
    id: string;
    content: string;
    similarity: number;
  }>;
  model_used: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ConversationSummary {
  text: string;
  topic: string;
  key_points: string[];
  message_count: number;
  time_range?: { start: string; end: string };
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  namespace?: string | null;
  is_active: boolean;
  secret?: string;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  webhook_name?: string;
  event_type: string;
  status: 'pending' | 'success' | 'failed';
  status_code?: number;
  error_message?: string;
  attempt_count: number;
  created_at: string;
  delivered_at?: string;
}

// Request types
export interface AddMemoryOptions {
  memory_type?: MemoryType;
  tags?: string[];
  namespace?: string;
  scope?: MemoryScope;
  session_id?: string;
  agent_id?: string;
  source?: string;
}

export interface SearchOptions {
  mode?: SearchMode;
  limit?: number;
  threshold?: number;
  namespace?: string;
}

export interface ExtractOptions {
  model?: 'haiku' | 'sonnet';
  auto_store?: boolean;
  namespace?: string;
}

export interface QueryOptions {
  model?: 'haiku' | 'sonnet';
  top_k?: number;
  namespace?: string;
  include_memories?: boolean;
}

export interface SummarizeOptions {
  model?: 'haiku' | 'sonnet';
  save_memories?: boolean;
  namespace?: string;
}

export interface CreateWebhookOptions {
  events?: WebhookEvent[];
  namespace?: string;
}

export interface SeiznConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}
