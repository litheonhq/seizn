export type MemoryType = "fact" | "preference" | "experience" | "relationship" | "instruction" | "belief";

export type MemoryScope = "user" | "session" | "agent" | "organization";

export type SearchMode = "auto" | "vector" | "keyword" | "hybrid" | "slot";

export interface MemoryRecord {
  id: string;
  content: string;
  memory_type?: MemoryType;
  tags?: string[];
  namespace?: string;
  scope?: MemoryScope;
  agent_id?: string | null;
  importance?: number;
  source?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AddMemoryRequest {
  content?: string;
  encrypted_content?: string;
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
  companion_meta?: Record<string, unknown> | null;
}

export interface SearchMemoriesRequest {
  query?: string;
  limit?: number;
  offset?: number;
  namespace?: string;
  memory_type?: MemoryType;
  tags?: string[] | string;
  agent_id?: string;
  scope?: MemoryScope;
  mode?: SearchMode;
  threshold?: number;
}

export interface DeleteMemoriesRequest {
  ids: string[];
  namespace?: string;
}

export interface CanonCheckRequest {
  npc_id?: string;
  npcId?: string;
  proposed_content?: string;
  proposedContent?: string;
  content?: string;
}

export interface CanonCheckResult {
  ok: boolean;
  npcId?: string | null;
  locksChecked: number;
  verdict?: Record<string, unknown>;
  violation?: Record<string, unknown> | null;
}

export interface ReplaySnapshot {
  [key: string]: unknown;
}

export interface ResponseMeta {
  version?: string;
  latencyMs?: number;
  [key: string]: unknown;
}

export interface ApiEnvelope<TData> {
  success: boolean;
  data: TData;
  meta?: ResponseMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta?: ResponseMeta;
}
