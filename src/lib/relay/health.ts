/**
 * Seizn Relay Health Monitoring
 *
 * Provides health checking and monitoring for relay agents.
 */

import { createServerClient } from '../supabase';
import {
  type RelayAgent,
  type RelayAgentRow,
  type RelayAgentStatus,
  rowToRelayAgent,
} from './types';
import { RelayClient } from './client';

// ============================================
// Types
// ============================================

export interface RelayHealthStatus {
  relayId: string;
  name: string;
  healthy: boolean;
  status: RelayAgentStatus;
  lastHeartbeat?: string;
  lastError?: string;
  metrics: RelayMetrics;
  details?: RelayHealthDetails;
}

export interface RelayMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  avgLatencyMs: number;
}

export interface RelayHealthDetails {
  version?: string;
  uptimeSeconds?: number;
  vectorDbStatus?: 'connected' | 'disconnected' | 'error';
  memoryUsageMb?: number;
  cpuUsagePercent?: number;
  activeConnections?: number;
  collections?: string[];
}

export interface AggregateRelayHealth {
  total: number;
  active: number;
  inactive: number;
  error: number;
  maintenance: number;
  overallHealthy: boolean;
  relays: RelayHealthStatus[];
}

// ============================================
// Health Check Functions
// ============================================

/**
 * Check health of a single relay agent
 */
export async function checkRelayHealth(
  relay: RelayAgent,
  detailed: boolean = false
): Promise<RelayHealthStatus> {
  const client = new RelayClient(relay);

  const healthStatus: RelayHealthStatus = {
    relayId: relay.id,
    name: relay.name,
    healthy: relay.status === 'active',
    status: relay.status,
    lastHeartbeat: relay.lastHeartbeat,
    lastError: relay.lastError,
    metrics: {
      totalRequests: relay.totalRequests,
      successfulRequests: relay.successfulRequests,
      failedRequests: relay.failedRequests,
      successRate: relay.totalRequests > 0
        ? (relay.successfulRequests / relay.totalRequests) * 100
        : 100,
      avgLatencyMs: relay.avgLatencyMs,
    },
  };

  // If relay has an endpoint, perform active health check
  if (relay.endpointUrl && relay.status !== 'maintenance') {
    try {
      const healthResponse = await client.healthCheck(detailed);

      healthStatus.healthy = healthResponse.healthy;
      healthStatus.details = {
        version: healthResponse.version,
        uptimeSeconds: healthResponse.uptimeSeconds,
        vectorDbStatus: healthResponse.vectorDbStatus,
        collections: healthResponse.collections,
      };

      if (healthResponse.diagnostics) {
        healthStatus.details.memoryUsageMb = healthResponse.diagnostics.memoryUsageMb;
        healthStatus.details.cpuUsagePercent = healthResponse.diagnostics.cpuUsagePercent;
        healthStatus.details.activeConnections = healthResponse.diagnostics.activeConnections;
      }

      // Update relay status in DB based on health check
      if (healthResponse.healthy && relay.status !== 'active') {
        await updateRelayStatus(relay.id, 'active');
      } else if (!healthResponse.healthy && relay.status === 'active') {
        await updateRelayStatus(relay.id, 'error', healthResponse.error);
      }
    } catch (error) {
      healthStatus.healthy = false;
      healthStatus.lastError = error instanceof Error ? error.message : 'Health check failed';

      // Update status to error if currently active
      if (relay.status === 'active') {
        await updateRelayStatus(relay.id, 'error', healthStatus.lastError);
      }
    }
  }

  return healthStatus;
}

/**
 * Check health of all relay agents for a user
 */
export async function checkAllRelayHealth(
  userId: string,
  detailed: boolean = false
): Promise<AggregateRelayHealth> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('relay_agents')
    .select('*')
    .eq('user_id', userId);

  if (error || !data) {
    return {
      total: 0,
      active: 0,
      inactive: 0,
      error: 0,
      maintenance: 0,
      overallHealthy: true,
      relays: [],
    };
  }

  const relays = data.map((row: RelayAgentRow) => rowToRelayAgent(row));
  const healthStatuses = await Promise.all(
    relays.map((relay) => checkRelayHealth(relay, detailed))
  );

  const statusCounts = {
    active: 0,
    inactive: 0,
    error: 0,
    maintenance: 0,
  };

  for (const relay of relays) {
    statusCounts[relay.status]++;
  }

  return {
    total: relays.length,
    active: statusCounts.active,
    inactive: statusCounts.inactive,
    error: statusCounts.error,
    maintenance: statusCounts.maintenance,
    overallHealthy: statusCounts.error === 0 && statusCounts.active > 0,
    relays: healthStatuses,
  };
}

/**
 * Update relay agent status
 */
export async function updateRelayStatus(
  relayId: string,
  status: RelayAgentStatus,
  lastError?: string
): Promise<void> {
  const supabase = createServerClient();

  await supabase
    .from('relay_agents')
    .update({
      status,
      last_error: lastError ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', relayId);
}

/**
 * Record relay heartbeat
 */
export async function recordHeartbeat(
  agentKey: string,
  version?: string
): Promise<{ success: boolean; relayId?: string; status?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('update_relay_heartbeat', {
    p_agent_key: agentKey,
    p_version: version ?? null,
  });

  if (error || !data || data.length === 0) {
    return { success: false };
  }

  return {
    success: data[0].success,
    relayId: data[0].relay_id,
    status: data[0].status,
  };
}

/**
 * Get stale relays (no heartbeat in given time)
 */
export async function getStaleRelays(
  userId: string,
  staleThresholdMinutes: number = 5
): Promise<RelayAgent[]> {
  const supabase = createServerClient();
  const threshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

  const { data, error } = await supabase
    .from('relay_agents')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('last_heartbeat', threshold.toISOString());

  if (error || !data) {
    return [];
  }

  return data.map((row: RelayAgentRow) => rowToRelayAgent(row));
}

/**
 * Mark stale relays as inactive
 */
export async function markStaleRelaysInactive(
  staleThresholdMinutes: number = 10
): Promise<number> {
  const supabase = createServerClient();
  const threshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

  const { data, error } = await supabase
    .from('relay_agents')
    .update({
      status: 'inactive',
      last_error: `No heartbeat for ${staleThresholdMinutes} minutes`,
    })
    .eq('status', 'active')
    .lt('last_heartbeat', threshold.toISOString())
    .select('id');

  if (error || !data) {
    return 0;
  }

  return data.length;
}

// ============================================
// Metrics Functions
// ============================================

/**
 * Get relay request statistics for a time period
 */
export async function getRelayRequestStats(
  relayId: string,
  startTime: Date,
  endTime: Date = new Date()
): Promise<RelayRequestStats> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('relay_requests')
    .select('status, latency_ms, result_count')
    .eq('relay_id', relayId)
    .gte('created_at', startTime.toISOString())
    .lte('created_at', endTime.toISOString());

  if (error || !data) {
    return {
      total: 0,
      completed: 0,
      errors: 0,
      timeouts: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      avgResultCount: 0,
    };
  }

  const completed = data.filter((r) => r.status === 'completed');
  const errors = data.filter((r) => r.status === 'error');
  const timeouts = data.filter((r) => r.status === 'timeout');

  const latencies = completed
    .map((r) => r.latency_ms)
    .filter((l): l is number => l !== null)
    .sort((a, b) => a - b);

  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] ?? 0;

  const resultCounts = completed
    .map((r) => r.result_count)
    .filter((c): c is number => c !== null);

  const avgResultCount = resultCounts.length > 0
    ? resultCounts.reduce((a, b) => a + b, 0) / resultCounts.length
    : 0;

  return {
    total: data.length,
    completed: completed.length,
    errors: errors.length,
    timeouts: timeouts.length,
    avgLatencyMs: avgLatency,
    p95LatencyMs: p95Latency,
    avgResultCount,
  };
}

export interface RelayRequestStats {
  total: number;
  completed: number;
  errors: number;
  timeouts: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgResultCount: number;
}
