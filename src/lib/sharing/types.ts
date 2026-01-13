/**
 * Share Trace Types
 * Type definitions for trace sharing and redaction
 */

export interface RedactionProfile {
  /** Mask PII: emails, phone numbers, RRN, credit cards, IPs */
  pii: boolean;
  /** Mask API keys, tokens, secrets */
  secrets: boolean;
  /** Hide raw chunk content (show only metadata) */
  raw_content: boolean;
}

export const DEFAULT_REDACTION_PROFILE: RedactionProfile = {
  pii: true,
  secrets: true,
  raw_content: false,
};

export type ExpiresIn = '1h' | '24h' | '7d' | 'never';

export interface ShareTraceRequest {
  expiresIn?: ExpiresIn;
  redactionProfile?: Partial<RedactionProfile>;
}

export interface ShareTraceResponse {
  shareUrl: string;
  token: string;
  expiresAt: string | null;
}

export interface SharedTraceRecord {
  id: string;
  share_token: string;
  share_id: string;
  trace_id: string;
  user_id: string;
  trace_snapshot: TraceSnapshot;
  redaction_profile: RedactionProfile;
  view_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface TraceSnapshot {
  id: string;
  request_id: string;
  plan: string;
  collection_id: string | null;
  query_text?: string;
  query_hash?: string;
  autopilot_reason?: string;
  effective_config: Record<string, unknown>;
  timings_ms: Record<string, number>;
  results_count: number;
  error?: string;
  trace: TraceData;
  sampled: boolean;
  created_at: string;
}

export interface TraceData {
  events?: TraceEvent[];
  candidates?: TraceCandidate[];
  rerank_deltas?: RerankDelta[];
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TraceEvent {
  name: string;
  stage: 'embed' | 'search' | 'rerank' | 'generate' | 'validate';
  start_ms: number;
  end_ms: number;
  model?: string;
  input?: string | number;
  output?: string | number;
  cached?: boolean;
  cost?: number;
  details?: Record<string, unknown>;
}

export interface TraceCandidate {
  chunk_id: string;
  score: number;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface RerankDelta {
  chunk_id: string;
  original_rank: number;
  reranked_rank: number;
  score_before: number;
  score_after: number;
}

export interface PublicTraceView {
  id: string;
  request_id: string;
  plan: string;
  collection_id: string | null;
  query_text?: string;
  autopilot_reason?: string;
  effective_config: Record<string, unknown>;
  timings_ms: Record<string, number>;
  results_count: number;
  error?: string;
  trace: TraceData;
  created_at: string;
  view_count: number;
  shared_at: string;
}
