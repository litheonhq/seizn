/**
 * Seizn Relay Protocol v1.0
 *
 * Defines the request/response protocol between Seizn cloud and relay agents.
 * The protocol is designed for minimal data exposure - only query results (IDs, scores, snippets)
 * are sent to the cloud, never the full document content.
 */

// ============================================
// Protocol Version
// ============================================

export const RELAY_PROTOCOL_VERSION = '1.0';

// ============================================
// Request Types
// ============================================

export type RelayAction = 'retrieve' | 'health' | 'capabilities';

export interface RelayProtocolRequest {
  /** Protocol version */
  version: typeof RELAY_PROTOCOL_VERSION;
  /** Unique request identifier */
  requestId: string;
  /** Action to perform */
  action: RelayAction;
  /** Action-specific payload */
  payload?: RetrievePayload | HealthPayload | CapabilitiesPayload;
  /** ISO timestamp of request */
  timestamp: string;
  /** HMAC-SHA256 signature for authentication */
  signature?: string;
}

export interface RetrievePayload {
  /** Search query text */
  query: string;
  /** Pre-computed query embedding from Seizn (optional - relay can compute locally) */
  queryEmbedding?: number[];
  /** Target collection ID */
  collectionId?: string;
  /** Number of results to return */
  topK?: number;
  /** Metadata filters */
  filters?: Record<string, unknown>;
  /** Whether to include text snippets in response */
  includeContent?: boolean;
  /** Maximum snippet length in characters */
  maxSnippetLength?: number;
}

export interface HealthPayload {
  /** Include detailed diagnostics */
  detailed?: boolean;
}

export interface CapabilitiesPayload {
  /** Request specific capability info */
  capability?: string;
}

// ============================================
// Response Types
// ============================================

export type RelayResponseStatus = 'success' | 'error';

export interface RelayProtocolResponse {
  /** Protocol version */
  version: typeof RELAY_PROTOCOL_VERSION;
  /** Request ID from the original request */
  requestId: string;
  /** Response status */
  status: RelayResponseStatus;
  /** Action-specific result payload */
  payload?: RetrieveResult | HealthResult | CapabilitiesResult;
  /** Error details if status is 'error' */
  error?: RelayError;
  /** Processing latency in milliseconds */
  latencyMs: number;
  /** Response timestamp */
  timestamp: string;
}

export interface RetrieveResult {
  /** Search results */
  results: RelaySearchResult[];
  /** Total matching documents (may be more than returned) */
  totalFound: number;
  /** Collection that was searched */
  collectionId?: string;
}

export interface RelaySearchResult {
  /** Chunk/document ID in the local vector DB */
  chunkId: string;
  /** Parent document ID */
  documentId: string;
  /** Similarity/relevance score (0-1) */
  score: number;
  /** Short text snippet for context (not full content) */
  snippet?: string;
  /** Document metadata (filtered to safe fields) */
  metadata?: Record<string, unknown>;
  /** Optional: document title */
  title?: string;
  /** Optional: source URL or reference */
  source?: string;
}

export interface HealthResult {
  /** Is the relay healthy and ready */
  healthy: boolean;
  /** Relay agent version */
  version: string;
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Connected collections */
  collections: string[];
  /** Vector DB connection status */
  vectorDbStatus: 'connected' | 'disconnected' | 'error';
  /** Optional: detailed diagnostics */
  diagnostics?: RelayDiagnostics;
}

export interface RelayDiagnostics {
  /** Memory usage in MB */
  memoryUsageMb: number;
  /** CPU usage percentage */
  cpuUsagePercent: number;
  /** Active connections */
  activeConnections: number;
  /** Pending requests */
  pendingRequests: number;
  /** Last successful query timestamp */
  lastQueryAt?: string;
  /** Vector DB specific info */
  vectorDb?: {
    type: string;
    version?: string;
    indexCount?: number;
    totalVectors?: number;
  };
}

export interface CapabilitiesResult {
  /** Supported actions */
  actions: RelayAction[];
  /** Supported embedding dimensions */
  embeddingDimensions: number[];
  /** Supported filters */
  supportedFilters: string[];
  /** Maximum batch size */
  maxBatchSize: number;
  /** Maximum top_k */
  maxTopK: number;
  /** Supported vector DB */
  vectorDbType: string;
  /** Additional capabilities metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// Error Types
// ============================================

export type RelayErrorCode =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_FAILED'
  | 'COLLECTION_NOT_FOUND'
  | 'VECTOR_DB_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface RelayError {
  /** Error code */
  code: RelayErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Is this error retryable */
  retryable: boolean;
}

// ============================================
// Callback Types (for callback mode)
// ============================================

export interface RelayCallbackRequest {
  /** Original request ID */
  requestId: string;
  /** Relay agent key for authentication */
  agentKey: string;
  /** Response data */
  response: RelayProtocolResponse;
  /** HMAC-SHA256 signature */
  signature: string;
}

export interface RelayCallbackResponse {
  /** Callback received successfully */
  received: boolean;
  /** Any additional instructions for relay */
  instructions?: {
    /** Should relay stop processing */
    cancel?: boolean;
    /** Update heartbeat interval */
    heartbeatIntervalMs?: number;
  };
}

// ============================================
// Protocol Utilities
// ============================================

/**
 * Create a new relay request
 */
export function createRelayRequest(
  action: RelayAction,
  payload?: RetrievePayload | HealthPayload | CapabilitiesPayload
): Omit<RelayProtocolRequest, 'signature'> {
  return {
    version: RELAY_PROTOCOL_VERSION,
    requestId: generateRequestId(),
    action,
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response
 */
export function createRelayResponse(
  requestId: string,
  payload: RetrieveResult | HealthResult | CapabilitiesResult,
  latencyMs: number
): RelayProtocolResponse {
  return {
    version: RELAY_PROTOCOL_VERSION,
    requestId,
    status: 'success',
    payload,
    latencyMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response
 */
export function createRelayErrorResponse(
  requestId: string,
  error: RelayError,
  latencyMs: number
): RelayProtocolResponse {
  return {
    version: RELAY_PROTOCOL_VERSION,
    requestId,
    status: 'error',
    error,
    latencyMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `relay_${timestamp}_${random}`;
}

/**
 * Validate a relay request
 */
export function validateRelayRequest(
  request: unknown
): request is RelayProtocolRequest {
  if (typeof request !== 'object' || request === null) {
    return false;
  }

  const req = request as Record<string, unknown>;

  return (
    req.version === RELAY_PROTOCOL_VERSION &&
    typeof req.requestId === 'string' &&
    typeof req.action === 'string' &&
    ['retrieve', 'health', 'capabilities'].includes(req.action as string) &&
    typeof req.timestamp === 'string'
  );
}

/**
 * Validate a relay response
 */
export function validateRelayResponse(
  response: unknown
): response is RelayProtocolResponse {
  if (typeof response !== 'object' || response === null) {
    return false;
  }

  const res = response as Record<string, unknown>;

  return (
    res.version === RELAY_PROTOCOL_VERSION &&
    typeof res.requestId === 'string' &&
    ['success', 'error'].includes(res.status as string) &&
    typeof res.latencyMs === 'number' &&
    typeof res.timestamp === 'string'
  );
}
