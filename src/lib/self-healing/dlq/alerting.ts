/**
 * DLQ Alerting Service
 *
 * Handles alerting and notifications for DLQ events:
 * - New entries added to DLQ
 * - Threshold alerts (too many pending entries)
 * - Webhook notifications
 * - Email notifications (placeholder)
 */

import { createServerClient } from '@/lib/supabase';
import { generateSignature } from '@/lib/webhook';
import type { DLQEntry, DLQStats, DLQAlertPayload, DLQAlertConfig, FailureCode } from './types';
import { getDLQStats, listDLQEntries } from './dlq';

// ============================================
// Alert Configuration
// ============================================

/**
 * Default alert configuration
 */
const DEFAULT_ALERT_CONFIG: DLQAlertConfig = {
  enabled: true,
  emailAlerts: false,
  webhookAlerts: true,
  alertThreshold: 5,
  criticalThreshold: 20,
  cooldownMinutes: 60,
};

/**
 * Get alert configuration for a user
 */
export async function getAlertConfig(
  userId: string,
  collectionId?: string
): Promise<DLQAlertConfig> {
  const supabase = createServerClient();

  // Try collection-specific config first
  if (collectionId) {
    const { data: collectionConfig } = await supabase
      .from('healing_config')
      .select('*')
      .eq('user_id', userId)
      .eq('collection_id', collectionId)
      .single();

    if (collectionConfig) {
      return mapAlertConfigFromDb(collectionConfig);
    }
  }

  // Fall back to user default
  const { data: userConfig } = await supabase
    .from('healing_config')
    .select('*')
    .eq('user_id', userId)
    .is('collection_id', null)
    .single();

  if (userConfig) {
    return mapAlertConfigFromDb(userConfig);
  }

  return DEFAULT_ALERT_CONFIG;
}

function mapAlertConfigFromDb(config: Record<string, unknown>): DLQAlertConfig {
  return {
    enabled: config.email_alerts || config.webhook_alerts ? true : DEFAULT_ALERT_CONFIG.enabled,
    emailAlerts: (config.email_alerts as boolean) ?? DEFAULT_ALERT_CONFIG.emailAlerts,
    webhookAlerts: (config.webhook_alerts as boolean) ?? DEFAULT_ALERT_CONFIG.webhookAlerts,
    webhookUrl: config.webhook_url as string | undefined,
    alertThreshold: (config.health_alert_threshold as number) ? 5 : DEFAULT_ALERT_CONFIG.alertThreshold,
    criticalThreshold: (config.critical_alert_threshold as number) ? 20 : DEFAULT_ALERT_CONFIG.criticalThreshold,
    cooldownMinutes: DEFAULT_ALERT_CONFIG.cooldownMinutes,
  };
}

// ============================================
// Alert Triggers
// ============================================

/**
 * Check and send alerts for DLQ threshold breaches
 */
export async function checkDLQThresholds(
  userId: string,
  collectionId?: string
): Promise<{ alertSent: boolean; severity?: 'warning' | 'critical' }> {
  const config = await getAlertConfig(userId, collectionId);

  if (!config.enabled) {
    return { alertSent: false };
  }

  const stats = await getDLQStats(userId);

  // Determine severity
  let severity: 'warning' | 'critical' | undefined;
  if (stats.pendingCount >= config.criticalThreshold) {
    severity = 'critical';
  } else if (stats.pendingCount >= config.alertThreshold) {
    severity = 'warning';
  }

  if (!severity) {
    return { alertSent: false };
  }

  // Check cooldown
  const canSend = await checkAlertCooldown(userId, config.cooldownMinutes);
  if (!canSend) {
    return { alertSent: false, severity };
  }

  // Send alerts
  await sendDLQAlert(userId, collectionId, stats, severity, config);

  return { alertSent: true, severity };
}

/**
 * Send alert when a new entry is added to DLQ
 */
export async function alertOnNewDLQEntry(
  entry: DLQEntry
): Promise<{ alertSent: boolean }> {
  const config = await getAlertConfig(entry.userId, entry.collectionId);

  if (!config.enabled) {
    return { alertSent: false };
  }

  // Mark alert as sent in database
  const supabase = createServerClient();
  await supabase
    .from('healing_dlq')
    .update({
      alert_sent: true,
      alert_sent_at: new Date().toISOString(),
    })
    .eq('id', entry.id);

  // Get stats for context
  const stats = await getDLQStats(entry.userId);

  // Determine severity based on current stats
  const severity = stats.pendingCount >= config.criticalThreshold ? 'critical' : 'warning';

  await sendDLQAlert(entry.userId, entry.collectionId, stats, severity, config, entry);

  return { alertSent: true };
}

/**
 * Check if enough time has passed since last alert
 */
async function checkAlertCooldown(
  userId: string,
  cooldownMinutes: number
): Promise<boolean> {
  const supabase = createServerClient();

  const cutoffTime = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('healing_dlq')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('alert_sent', true)
    .gte('alert_sent_at', cutoffTime);

  // Allow alert if no recent alerts
  return (count ?? 0) === 0;
}

// ============================================
// Alert Delivery
// ============================================

/**
 * Send DLQ alert via configured channels
 */
async function sendDLQAlert(
  userId: string,
  collectionId: string | undefined,
  stats: DLQStats,
  severity: 'warning' | 'critical',
  config: DLQAlertConfig,
  newEntry?: DLQEntry
): Promise<void> {
  // Build alert payload
  const payload = await buildAlertPayload(userId, collectionId, stats, severity, newEntry);

  // Send webhook alert
  if (config.webhookAlerts && config.webhookUrl) {
    await sendWebhookAlert(config.webhookUrl, payload);
  }

  // Send email alert (placeholder - integrate with email service)
  if (config.emailAlerts) {
    await sendEmailAlert(userId, payload);
  }
}

/**
 * Build alert payload with recent failures
 */
async function buildAlertPayload(
  userId: string,
  collectionId: string | undefined,
  stats: DLQStats,
  severity: 'warning' | 'critical',
  newEntry?: DLQEntry
): Promise<DLQAlertPayload> {
  // Get recent failures for context
  const { entries: recentEntries } = await listDLQEntries(userId, {
    status: 'pending',
    limit: 5,
  });

  const recentFailures = recentEntries.map((entry) => ({
    dlqId: entry.id,
    failureReason: entry.failureReason,
    failureCode: entry.failureCode,
    createdAt: entry.createdAt,
  }));

  return {
    type: 'dlq_alert',
    severity,
    userId,
    collectionId,
    pendingCount: stats.pendingCount,
    threshold: severity === 'critical' ? 20 : 5,
    oldestPendingAt: stats.oldestPendingAt,
    recentFailures,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send webhook notification
 */
async function sendWebhookAlert(
  webhookUrl: string,
  payload: DLQAlertPayload
): Promise<void> {
  const payloadString = JSON.stringify(payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Seizn-Event': 'dlq.alert',
    'X-Seizn-Timestamp': new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('DLQ webhook alert failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('DLQ webhook alert error:', error);
  }
}

/**
 * Send email notification (placeholder)
 */
async function sendEmailAlert(
  userId: string,
  payload: DLQAlertPayload
): Promise<void> {
  // TODO: Integrate with email service (Resend, SendGrid, etc.)
  console.log('Email alert would be sent to user:', userId, payload);
}

// ============================================
// Monitoring Hooks
// ============================================

/**
 * Monitoring callback type
 */
export type DLQMonitoringCallback = (event: DLQMonitoringEvent) => void | Promise<void>;

/**
 * Monitoring event types
 */
export interface DLQMonitoringEvent {
  type: 'entry_created' | 'entry_retried' | 'entry_resolved' | 'threshold_exceeded' | 'alert_sent';
  timestamp: string;
  userId: string;
  collectionId?: string;
  dlqId?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  metadata?: Record<string, unknown>;
}

// Registered monitoring callbacks
const monitoringCallbacks: DLQMonitoringCallback[] = [];

/**
 * Register a monitoring callback
 */
export function registerDLQMonitoring(callback: DLQMonitoringCallback): void {
  monitoringCallbacks.push(callback);
}

/**
 * Unregister a monitoring callback
 */
export function unregisterDLQMonitoring(callback: DLQMonitoringCallback): void {
  const index = monitoringCallbacks.indexOf(callback);
  if (index !== -1) {
    monitoringCallbacks.splice(index, 1);
  }
}

/**
 * Emit monitoring event to all registered callbacks
 */
export async function emitDLQEvent(event: DLQMonitoringEvent): Promise<void> {
  for (const callback of monitoringCallbacks) {
    try {
      await callback(event);
    } catch (error) {
      console.error('DLQ monitoring callback error:', error);
    }
  }
}

/**
 * Emit entry created event
 */
export async function emitEntryCreated(entry: DLQEntry): Promise<void> {
  await emitDLQEvent({
    type: 'entry_created',
    timestamp: new Date().toISOString(),
    userId: entry.userId,
    collectionId: entry.collectionId,
    dlqId: entry.id,
    severity: 'warning',
    metadata: {
      failureCode: entry.failureCode,
      failureReason: entry.failureReason,
      originalJobId: entry.originalJobId,
    },
  });
}

/**
 * Emit entry retried event
 */
export async function emitEntryRetried(
  entry: DLQEntry,
  newJobId: string
): Promise<void> {
  await emitDLQEvent({
    type: 'entry_retried',
    timestamp: new Date().toISOString(),
    userId: entry.userId,
    collectionId: entry.collectionId,
    dlqId: entry.id,
    severity: 'info',
    metadata: {
      newJobId,
      dlqRetryCount: entry.dlqRetryCount,
    },
  });
}

/**
 * Emit entry resolved event
 */
export async function emitEntryResolved(entry: DLQEntry): Promise<void> {
  await emitDLQEvent({
    type: 'entry_resolved',
    timestamp: new Date().toISOString(),
    userId: entry.userId,
    collectionId: entry.collectionId,
    dlqId: entry.id,
    severity: 'info',
    metadata: {
      status: entry.status,
      resolutionNotes: entry.resolutionNotes,
    },
  });
}
