// Seizn Database Types (matches Supabase schema)

export type Plan = 'free' | 'plus' | 'pro' | 'enterprise';
export type MemoryType = 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';
export type MemoryScope = 'user' | 'session' | 'agent';
export type ModerationCategory = 'sexual' | 'violence' | 'pii' | 'hate' | 'self_harm' | 'csam';
export type ModerationAction = 'block' | 'redact' | 'flag';
export type ModerationStatus = 'clean' | 'flagged' | 'redacted' | 'blocked';
export type SupportedLocale = 'en' | 'ko' | 'ja';
export type CompanionMeta = Record<string, unknown>;

// Data Residency Regions
export type DataRegion = 'us-east' | 'us-west' | 'eu-west' | 'eu-central' | 'ap-northeast' | 'ap-southeast';

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

  // Preferences
  language: SupportedLocale;
  default_region?: DataRegion | null;

  // E2E Memory Encryption (confidential memories)
  // NOTE: Salt + verification block are not secrets. PIN/key material is never stored.
  e2e_salt?: string | null;
  e2e_verification_block?: string | null;
  e2e_setup_at?: string | null;

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
  // Preferences
  language: SupportedLocale;

  created_at: string;
}

export interface Memory {
  id: string;
  user_id: string;
  organization_id?: string | null;
  entity_id?: string | null;

  content: string;
  // For encrypted memories, content is the placeholder "[encrypted]"
  encrypted_content?: string | null;
  is_encrypted?: boolean;
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
  companion_meta?: CompanionMeta | null;
  tier?: 'hot' | 'warm' | 'cold';
  pinned?: boolean;
  last_recalled_at?: string | null;
  recall_count?: number;
  size_bytes?: number;
  memory_class?: string;
  half_life_hours?: number | null;
  base_strength?: number;
  last_reinforced_at?: string | null;
  moderation_status?: ModerationStatus;
  moderation_scores?: Partial<Record<ModerationCategory, number>> | null;

  // Preferences
  language: SupportedLocale;

  created_at: string;
  updated_at: string;
  accessed_at: string;

  is_deleted: boolean;
  deleted_at: string | null;
}

export interface ModerationPolicy {
  organization_id: string;
  policy_name: string;
  memory_class: string;
  category: ModerationCategory;
  action: ModerationAction;
  threshold: number;
  updated_at: string;
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

  // Preferences
  language: SupportedLocale;

  created_at: string;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  source: string;
  referrer: string | null;
  // Preferences
  language: SupportedLocale;

  created_at: string;
}

export type WebhookEvent = 'memory.created' | 'memory.updated' | 'memory.deleted';

export interface Webhook {
  id: string;
  user_id: string;
  name: string;
  url: string;
  secret: string | null;
  events: WebhookEvent[];
  namespace: string | null;
  is_active: boolean;
  // Preferences
  language: SupportedLocale;

  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  // Preferences
  language: SupportedLocale;

  created_at: string;
  delivered_at: string | null;
}

// Organization types
export interface Organization {
  id: string;
  name: string;
  slug: string;

  // Billing
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;

  // Limits
  memory_limit: number;
  api_calls_limit: number;

  // Data Residency
  data_region: DataRegion;
  region_locked: boolean;
  region_changed_at: string | null;

  // Settings
  settings: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  permissions: Record<string, unknown>;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string;
  created_at: string;
}

export interface OrganizationRegionHistory {
  id: string;
  organization_id: string;
  from_region: DataRegion | null;
  to_region: DataRegion;
  reason: string | null;
  changed_by: string;
  change_type: 'initial_setup' | 'user_initiated' | 'admin_migration' | 'compliance_requirement';
  created_at: string;
}

// API Request/Response types
export interface AddMemoryRequest {
  // Plaintext content (required when is_encrypted is false/omitted)
  content?: string;
  // Base64 ciphertext (required when is_encrypted is true)
  encrypted_content?: string;
  // When true, server stores ciphertext only and skips embeddings/dedup/optimization
  is_encrypted?: boolean;
  memory_type?: MemoryType;
  tags?: string[];
  namespace?: string;
  scope?: MemoryScope;
  session_id?: string;
  agent_id?: string;
  entity_id?: string;
  pinned?: boolean;
  memory_class?: string;
  half_life_hours?: number | null;
  source?: string;
  companion_meta?: CompanionMeta | null;
  // Optional image attachment payload (object storage + asset link)
  image_url?: string;
  image_base64?: string;
  image_mime_type?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  image_filename?: string;
  image_relation?: 'attachment' | 'source' | 'reference' | 'derived';
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

export interface Scene {
  id: string;
  user_id: string;
  organization_id: string | null;
  namespace: string;
  entity_ids: string[];
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  outcomes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
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
          organization_id?: string | null;
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
          companion_meta?: CompanionMeta | null;
          moderation_status?: ModerationStatus;
          moderation_scores?: Partial<Record<ModerationCategory, number>> | null;
        };
        Update: Partial<Memory>;
      };
      moderation_policies: {
        Row: ModerationPolicy;
        Insert: Omit<ModerationPolicy, 'updated_at'> & { updated_at?: string };
        Update: Partial<ModerationPolicy>;
      };
      scenes: {
        Row: Scene;
        Insert: Omit<Scene, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Scene>;
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
      organizations: {
        Row: Organization;
        Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Organization>;
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Omit<OrganizationMember, 'id' | 'created_at'>;
        Update: Partial<OrganizationMember>;
      };
      organization_region_history: {
        Row: OrganizationRegionHistory;
        Insert: Omit<OrganizationRegionHistory, 'id' | 'created_at'>;
        Update: Partial<OrganizationRegionHistory>;
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
      change_organization_region: {
        Args: {
          p_org_id: string;
          p_user_id: string;
          p_new_region: DataRegion;
          p_reason?: string;
        };
        Returns: {
          success: boolean;
          error?: string;
          previous_region?: DataRegion;
          new_region?: DataRegion;
        };
      };
    };
  };
}
