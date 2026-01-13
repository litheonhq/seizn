/**
 * Seizn Relay Client
 *
 * Client library for communicating with relay agents from Seizn cloud.
 * Supports both direct (Seizn calls relay) and callback (relay calls Seizn) modes.
 */

import { createServerClient } from '../supabase';
import {
  type RelayAgent,
  type RelayConfig,
  type RelayAgentRow,
  DEFAULT_RELAY_CONFIG,
  rowToRelayAgent,
} from './types';
import {
  type RelayProtocolRequest,
  type RelayProtocolResponse,
  type RetrievePayload,
  type RetrieveResult,
  type HealthResult,
  type CapabilitiesResult,
  type RelaySearchResult,
  createRelayRequest,
  validateRelayResponse,
} from './protocol';
import { signRequest, generateCallbackToken } from './auth';

// ============================================
// Relay Client Class
// ============================================

export class RelayClient {
  private relay: RelayAgent;
  private config: RelayConfig;

  constructor(relay: RelayAgent, config?: Partial<RelayConfig>) {
    this.relay = relay;
    this.config = { ...DEFAULT_RELAY_CONFIG, ...config };
  }

  /**
   * Perform a vector search via the relay agent
   */
  async retrieve(
    query: string,
    options: RetrieveOptions = {}
  ): Promise<RelayRetrieveResponse> {
    const startTime = Date.now();

    const payload: RetrievePayload = {
      query,
      queryEmbedding: options.queryEmbedding,
      collectionId: options.collectionId,
      topK: options.topK ?? 10,
      filters: options.filters,
      includeContent: options.includeContent ?? true,
      maxSnippetLength: options.maxSnippetLength ?? 500,
    };

    const request = createRelayRequest('retrieve', payload);

    try {
      const response = await this.sendRequest(request);

      if (response.status === 'error') {
        return {
          success: false,
          error: response.error?.message ?? 'Unknown error',
          latencyMs: Date.now() - startTime,
        };
      }

      const result = response.payload as RetrieveResult;

      return {
        success: true,
        results: result.results,
        totalFound: result.totalFound,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Check relay agent health
   */
  async healthCheck(detailed: boolean = false): Promise<RelayHealthResponse> {
    const startTime = Date.now();

    const request = createRelayRequest('health', { detailed });

    try {
      const response = await this.sendRequest(request);

      if (response.status === 'error') {
        return {
          healthy: false,
          error: response.error?.message,
          latencyMs: Date.now() - startTime,
        };
      }

      const result = response.payload as HealthResult;

      return {
        healthy: result.healthy,
        version: result.version,
        uptimeSeconds: result.uptimeSeconds,
        collections: result.collections,
        vectorDbStatus: result.vectorDbStatus,
        diagnostics: result.diagnostics,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Health check failed',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get relay agent capabilities
   */
  async getCapabilities(): Promise<RelayCapabilitiesResponse> {
    const startTime = Date.now();

    const request = createRelayRequest('capabilities', {});

    try {
      const response = await this.sendRequest(request);

      if (response.status === 'error') {
        return {
          success: false,
          error: response.error?.message,
          latencyMs: Date.now() - startTime,
        };
      }

      const result = response.payload as CapabilitiesResult;

      return {
        success: true,
        capabilities: result,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Capabilities check failed',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Send a request to the relay agent
   */
  private async sendRequest(
    request: Omit<RelayProtocolRequest, 'signature'>
  ): Promise<RelayProtocolResponse> {
    // Sign the request
    const signedRequest: RelayProtocolRequest = {
      ...request,
      signature: signRequest(request, this.relay.agentKey),
    };

    // Determine mode and send
    if (this.relay.connectionMode === 'callback' || !this.relay.endpointUrl) {
      return this.sendViaCallback(signedRequest);
    } else {
      return this.sendDirect(signedRequest);
    }
  }

  /**
   * Send request directly to relay endpoint
   */
  private async sendDirect(
    request: RelayProtocolRequest
  ): Promise<RelayProtocolResponse> {
    if (!this.relay.endpointUrl) {
      throw new Error('Relay endpoint URL not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.relay.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Request-Id': request.requestId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Relay returned status ${response.status}`);
      }

      const data = await response.json();

      if (!validateRelayResponse(data)) {
        throw new Error('Invalid response from relay');
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Relay request timed out');
      }

      throw error;
    }
  }

  /**
   * Send request via callback mode (store pending, wait for relay to call back)
   */
  private async sendViaCallback(
    request: RelayProtocolRequest
  ): Promise<RelayProtocolResponse> {
    const supabase = createServerClient();

    // Generate callback token
    const callbackToken = generateCallbackToken(
      request.requestId,
      this.relay.agentKey,
      this.config.timeout
    );

    // Store pending callback
    const expiresAt = new Date(Date.now() + this.config.timeout);

    await supabase.from('relay_pending_callbacks').insert({
      relay_id: this.relay.id,
      request_id: request.requestId,
      payload: {
        ...request.payload,
        callbackToken,
      },
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    });

    // Wait for callback response
    return this.waitForCallback(request.requestId);
  }

  /**
   * Poll for callback response
   */
  private async waitForCallback(
    requestId: string
  ): Promise<RelayProtocolResponse> {
    const supabase = createServerClient();
    const startTime = Date.now();
    const pollInterval = 500; // ms

    while (Date.now() - startTime < this.config.timeout) {
      // Check for response in relay_requests
      const { data } = await supabase
        .from('relay_requests')
        .select('*')
        .eq('request_id', requestId)
        .single();

      if (data && data.status !== 'pending' && data.status !== 'processing') {
        // Mark callback as received
        await supabase
          .from('relay_pending_callbacks')
          .update({ status: 'received' })
          .eq('request_id', requestId);

        if (data.status === 'completed') {
          return {
            version: '1.0',
            requestId,
            status: 'success',
            payload: {
              results: [],
              totalFound: data.result_count ?? 0,
            } as RetrieveResult,
            latencyMs: data.latency_ms ?? Date.now() - startTime,
            timestamp: new Date().toISOString(),
          };
        } else {
          return {
            version: '1.0',
            requestId,
            status: 'error',
            error: {
              code: 'INTERNAL_ERROR',
              message: data.error_message ?? 'Unknown error',
              retryable: true,
            },
            latencyMs: data.latency_ms ?? Date.now() - startTime,
            timestamp: new Date().toISOString(),
          };
        }
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout
    await supabase
      .from('relay_pending_callbacks')
      .update({ status: 'expired' })
      .eq('request_id', requestId);

    return {
      version: '1.0',
      requestId,
      status: 'error',
      error: {
        code: 'TIMEOUT',
        message: 'Relay callback timed out',
        retryable: true,
      },
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================
// Types
// ============================================

export interface RetrieveOptions {
  queryEmbedding?: number[];
  collectionId?: string;
  topK?: number;
  filters?: Record<string, unknown>;
  includeContent?: boolean;
  maxSnippetLength?: number;
}

export interface RelayRetrieveResponse {
  success: boolean;
  results?: RelaySearchResult[];
  totalFound?: number;
  error?: string;
  latencyMs: number;
}

export interface RelayHealthResponse {
  healthy: boolean;
  version?: string;
  uptimeSeconds?: number;
  collections?: string[];
  vectorDbStatus?: 'connected' | 'disconnected' | 'error';
  diagnostics?: {
    memoryUsageMb: number;
    cpuUsagePercent: number;
    activeConnections: number;
    pendingRequests: number;
  };
  error?: string;
  latencyMs: number;
}

export interface RelayCapabilitiesResponse {
  success: boolean;
  capabilities?: CapabilitiesResult;
  error?: string;
  latencyMs: number;
}

// ============================================
// Factory Functions
// ============================================

/**
 * Get a RelayClient for a specific collection
 * Returns null if no active relay serves this collection
 */
export async function getRelayForCollection(
  userId: string,
  collectionId: string
): Promise<RelayClient | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_relay_for_collection', {
    p_user_id: userId,
    p_collection_id: collectionId,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  // Get full relay agent data
  const { data: relayRow } = await supabase
    .from('relay_agents')
    .select('*')
    .eq('id', data[0].relay_id)
    .single();

  if (!relayRow) {
    return null;
  }

  const relay = rowToRelayAgent(relayRow as RelayAgentRow);
  return new RelayClient(relay);
}

/**
 * Get a RelayClient by relay ID
 */
export async function getRelayById(
  relayId: string,
  userId: string
): Promise<RelayClient | null> {
  const supabase = createServerClient();

  const { data: relayRow } = await supabase
    .from('relay_agents')
    .select('*')
    .eq('id', relayId)
    .eq('user_id', userId)
    .single();

  if (!relayRow) {
    return null;
  }

  const relay = rowToRelayAgent(relayRow as RelayAgentRow);
  return new RelayClient(relay);
}

/**
 * Get all relay agents for a user
 */
export async function listRelayAgents(userId: string): Promise<RelayAgent[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('relay_agents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row: RelayAgentRow) => rowToRelayAgent(row));
}
