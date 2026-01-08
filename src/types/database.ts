// Seizn Database Types (matches Supabase schema)

export type Plan = 'free' | 'plus' | 'pro' | 'enterprise';
export type MemoryType = 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';
export type MemoryScope = 'user' | 'session' | 'agent';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;

  // Subscription
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;

  // Limits
  memory_limit: number;
  api_calls_limit: number;

  // Usage
  memory_count: number;
  api_calls_this_month: number;

  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Memory {
  id: string;
  user_id: string;

  content: string;
  embedding: number[] | null;

  memory_type: MemoryType;
  tags: string[];
  namespace: string;

  scope: MemoryScope;
  session_id: string | null;
  agent_id: string | null;

  source: string | null;
  confidence: number;
  importance: number;

  created_at: string;
  updated_at: string;
  accessed_at: string;

  is_deleted: boolean;
  deleted_at: string | null;
}

export interface UsageLog {
  id: string;
  user_id: string;
  api_key_id: string | null;

  endpoint: string;
  method: string;

  input_tokens: number;
  output_tokens: number;
  embedding_tokens: number;
  cost_cents: number;

  status_code: number | null;
  latency_ms: number | null;

  created_at: string;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  source: string;
  referrer: string | null;
  created_at: string;
}

// API Request/Response types
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

export interface SearchMemoryRequest {
  query: string;
  limit?: number;
  threshold?: number;
  memory_type?: MemoryType;
  tags?: string[];
  namespace?: string;
  scope?: MemoryScope;
  session_id?: string;
  agent_id?: string;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  memory_type: MemoryType;
  tags: string[];
  namespace: string;
  similarity: number;
}

// Supabase Database type for client
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
      };
      api_keys: {
        Row: ApiKey;
        Insert: Omit<ApiKey, 'id' | 'created_at' | 'last_used_at' | 'expires_at'> & {
          last_used_at?: string | null;
          expires_at?: string | null;
        };
        Update: Partial<ApiKey>;
      };
      memories: {
        Row: Memory;
        Insert: {
          user_id: string;
          content: string;
          embedding?: number[] | null;
          memory_type?: MemoryType;
          tags?: string[];
          namespace?: string;
          scope?: MemoryScope;
          session_id?: string | null;
          agent_id?: string | null;
          source?: string | null;
          confidence?: number;
          importance?: number;
        };
        Update: Partial<Memory>;
      };
      usage_logs: {
        Row: UsageLog;
        Insert: Omit<UsageLog, 'id' | 'created_at'>;
        Update: Partial<UsageLog>;
      };
      waitlist: {
        Row: WaitlistEntry;
        Insert: Omit<WaitlistEntry, 'id' | 'created_at'>;
        Update: Partial<WaitlistEntry>;
      };
    };
    Functions: {
      search_memories: {
        Args: {
          query_embedding: number[];
          match_user_id: string;
          match_count?: number;
          match_threshold?: number;
          match_namespace?: string;
        };
        Returns: MemorySearchResult[];
      };
    };
  };
}
