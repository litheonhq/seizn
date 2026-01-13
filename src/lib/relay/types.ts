/**
 * Seizn Relay - Type Definitions
 *
 * Edge federated agent types for enterprise on-premises data integration.
 */

// ============================================
// Relay Agent Types
// ============================================

export type RelayAgentStatus = 'inactive' | 'active' | 'error' | 'maintenance';

export type RelayConnectionMode = 'callback' | 'direct' | 'hybrid';

export type RelayCapability = 'retrieve' | 'health' | 'capabilities';

export interface RelayAgent {
  id: string;
  userId: string;
  orgId?: string;

  // Agent identification
  name: string;
  description?: string;
  agentKey: string;

  // Configuration
  endpointUrl?: string;
  capabilities: RelayCapability[];
  collections: string[];
  connectionMode: RelayConnectionMode;

  // Health & status
  status: RelayAgentStatus;
  lastHeartbeat?: string;
  lastError?: string;
  version?: string;

  // Metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;

  // Security
  ipWhitelist?: string[];
  tlsRequired: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface CreateRelayAgentInput {
  name: string;
  description?: string;
  endpointUrl?: string;
  capabilities?: RelayCapability[];
  collections?: string[];
  connectionMode?: RelayConnectionMode;
  ipWhitelist?: string[];
  tlsRequired?: boolean;
}

export interface UpdateRelayAgentInput {
  name?: string;
  description?: string;
  endpointUrl?: string;
  capabilities?: RelayCapability[];
  collections?: string[];
  connectionMode?: RelayConnectionMode;
  status?: RelayAgentStatus;
  ipWhitelist?: string[];
  tlsRequired?: boolean;
}

// ============================================
// Relay Request Types
// ============================================

export type RelayRequestStatus = 'pending' | 'processing' | 'completed' | 'error' | 'timeout';

export interface RelayRequestLog {
  id: string;
  relayId: string;
  requestId: string;

  // Request info
  queryHash?: string;
  collectionId?: string;
  topK?: number;

  // Response info
  status: RelayRequestStatus;
  resultCount?: number;
  latencyMs?: number;
  errorMessage?: string;

  // Metadata
  sourceIp?: string;
  userAgent?: string;

  createdAt: string;
  completedAt?: string;
}

// ============================================
// Relay Callback Types
// ============================================

export interface RelayPendingCallback {
  id: string;
  relayId: string;
  requestId: string;

  payload: RelayCallbackPayload;
  callbackUrl?: string;
  expiresAt: string;

  status: 'pending' | 'received' | 'expired';

  createdAt: string;
}

export interface RelayCallbackPayload {
  query?: string;
  queryEmbedding?: number[];
  collectionId?: string;
  topK?: number;
  filters?: Record<string, unknown>;
  includeContent?: boolean;
}

// ============================================
// Configuration Types
// ============================================

export interface RelayConfig {
  /** Maximum time to wait for relay response (ms) */
  timeout: number;
  /** Number of retries on failure */
  retries: number;
  /** Backoff multiplier for retries */
  backoffMultiplier: number;
  /** Enable TLS verification */
  verifyTls: boolean;
  /** Maximum results to return from relay */
  maxResults: number;
}

export const DEFAULT_RELAY_CONFIG: RelayConfig = {
  timeout: 30000,
  retries: 3,
  backoffMultiplier: 2,
  verifyTls: true,
  maxResults: 100,
};

// ============================================
// Database Row Types (Supabase)
// ============================================

export interface RelayAgentRow {
  id: string;
  user_id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  agent_key: string;
  endpoint_url: string | null;
  capabilities: string[];
  collections: string[];
  connection_mode: string;
  status: string;
  last_heartbeat: string | null;
  last_error: string | null;
  version: string | null;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_latency_ms: number;
  ip_whitelist: string[] | null;
  tls_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface RelayRequestRow {
  id: string;
  relay_id: string;
  request_id: string;
  query_hash: string | null;
  collection_id: string | null;
  top_k: number | null;
  status: string;
  result_count: number | null;
  latency_ms: number | null;
  error_message: string | null;
  source_ip: string | null;
  user_agent: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============================================
// Utility Functions
// ============================================

export function rowToRelayAgent(row: RelayAgentRow): RelayAgent {
  return {
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    agentKey: row.agent_key,
    endpointUrl: row.endpoint_url ?? undefined,
    capabilities: row.capabilities as RelayCapability[],
    collections: row.collections,
    connectionMode: row.connection_mode as RelayConnectionMode,
    status: row.status as RelayAgentStatus,
    lastHeartbeat: row.last_heartbeat ?? undefined,
    lastError: row.last_error ?? undefined,
    version: row.version ?? undefined,
    totalRequests: row.total_requests,
    successfulRequests: row.successful_requests,
    failedRequests: row.failed_requests,
    avgLatencyMs: row.avg_latency_ms,
    ipWhitelist: row.ip_whitelist ?? undefined,
    tlsRequired: row.tls_required,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToRelayRequest(row: RelayRequestRow): RelayRequestLog {
  return {
    id: row.id,
    relayId: row.relay_id,
    requestId: row.request_id,
    queryHash: row.query_hash ?? undefined,
    collectionId: row.collection_id ?? undefined,
    topK: row.top_k ?? undefined,
    status: row.status as RelayRequestStatus,
    resultCount: row.result_count ?? undefined,
    latencyMs: row.latency_ms ?? undefined,
    errorMessage: row.error_message ?? undefined,
    sourceIp: row.source_ip ?? undefined,
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}
