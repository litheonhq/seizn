/**
 * Seizn Relay - Edge Federated Agent
 *
 * Enables enterprises to keep data on-premises while using Seizn for orchestration.
 * A lightweight relay agent runs in customer VPC and handles local vector search,
 * sending only query results (IDs, scores, snippets) to Seizn cloud.
 *
 * @module relay
 */

// Types
export * from './types';

// Protocol
export * from './protocol';

// Authentication
export {
  generateAgentKey,
  isValidAgentKey,
  hashAgentKey,
  verifyAgentKeyHash,
  signRequest,
  verifyRequestSignature,
  signCallbackRequest,
  verifyCallbackSignature,
  generateCallbackToken,
  verifyCallbackToken,
  maskAgentKey,
} from './auth';

// Client
export {
  RelayClient,
  getRelayForCollection,
  getRelayById,
  listRelayAgents,
  type RetrieveOptions,
  type RelayRetrieveResponse,
  type RelayHealthResponse,
  type RelayCapabilitiesResponse,
} from './client';

// Health Monitoring
export {
  checkRelayHealth,
  checkAllRelayHealth,
  updateRelayStatus,
  recordHeartbeat,
  getStaleRelays,
  markStaleRelaysInactive,
  getRelayRequestStats,
  type RelayHealthStatus,
  type RelayMetrics,
  type RelayHealthDetails,
  type AggregateRelayHealth,
  type RelayRequestStats,
} from './health';
