/**
 * Control Tower - Alerts Service
 *
 * Alert management, notification, and rule evaluation
 */

import { createServerClient } from '@/lib/supabase';
import { normalizeOutboundWebhookUrl } from '@/lib/security/outbound-webhook';
import type {
  Alert,
  AlertRule,
  AlertSeverity,
  AlertStatus,
  AlertCondition,
  NotificationChannel,
} from './types';
import crypto from 'crypto';

/**
 * Get active alerts for a user/organization
 */
export async function getActiveAlerts(
  userId: string,
  organizationId?: string
): Promise<Alert[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('alerts')
    .select('*')
    .in('status', ['firing', 'acknowledged'])
    .order('created_at', { ascending: false });

  if (organizationId) {
    query = query.or(`user_id.eq.${userId},org_id.eq.${organizationId}`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    console.error('Failed to get active alerts:', error);
    return [];
  }

  return (data || []).map(mapAlertFromDb);
}

/**
 * Get alert history
 */
export async function getAlertHistory(
  userId: string,
  options: {
    organizationId?: string;
    severity?: AlertSeverity;
    status?: AlertStatus;
    since?: string;
    limit?: number;
  } = {}
): Promise<Alert[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.organizationId) {
    query = query.or(`user_id.eq.${userId},org_id.eq.${options.organizationId}`);
  } else {
    query = query.eq('user_id', userId);
  }

  if (options.severity) query = query.eq('severity', options.severity);
  if (options.status) query = query.eq('status', options.status);
  if (options.since) query = query.gte('created_at', options.since);

  const { data, error } = await query.limit(options.limit || 100);

  if (error) {
    console.error('Failed to get alert history:', error);
    return [];
  }

  return (data || []).map(mapAlertFromDb);
}

/**
 * Create a new alert
 */
export async function createAlert(
  params: {
    userId: string;
    organizationId?: string;
    ruleId?: string;
    name: string;
    description: string;
    severity: AlertSeverity;
    source: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  }
): Promise<Alert | null> {
  const supabase = createServerClient();

  // Generate fingerprint for deduplication
  const fingerprint = generateAlertFingerprint(params.name, params.source, params.labels);

  // Check for existing firing alert with same fingerprint
  const { data: existing } = await supabase
    .from('alerts')
    .select('id')
    .eq('fingerprint', fingerprint)
    .eq('status', 'firing')
    .single();

  if (existing) {
    // Alert already firing, update timestamp
    const { data, error } = await supabase
      .from('alerts')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update existing alert:', error);
      return null;
    }

    return mapAlertFromDb(data);
  }

  // Create new alert
  const { data, error } = await supabase
    .from('alerts')
    .insert({
      user_id: params.userId,
      org_id: params.organizationId || null,
      rule_id: params.ruleId || null,
      name: params.name,
      description: params.description,
      severity: params.severity,
      status: 'firing',
      source: params.source,
      labels: params.labels || {},
      annotations: params.annotations || {},
      fingerprint,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create alert:', error);
    return null;
  }

  const alert = mapAlertFromDb(data);

  // Send notifications
  await sendAlertNotifications(params.userId, params.organizationId, alert);

  return alert;
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string
): Promise<Alert | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('alerts')
    .update({
      status: 'acknowledged',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', alertId)
    .select()
    .single();

  if (error) {
    console.error('Failed to acknowledge alert:', error);
    return null;
  }

  return mapAlertFromDb(data);
}

/**
 * Resolve an alert
 */
export async function resolveAlert(alertId: string): Promise<Alert | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', alertId)
    .select()
    .single();

  if (error) {
    console.error('Failed to resolve alert:', error);
    return null;
  }

  return mapAlertFromDb(data);
}

/**
 * Silence an alert
 */
export async function silenceAlert(
  alertId: string,
  until: string
): Promise<Alert | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('alerts')
    .update({
      status: 'silenced',
    })
    .eq('id', alertId)
    .select()
    .single();

  if (error) {
    console.error('Failed to silence alert:', error);
    return null;
  }

  return mapAlertFromDb(data);
}

// ============================================
// Alert Rules
// ============================================

/**
 * Get alert rules for a user/organization
 */
export async function getAlertRules(
  userId: string,
  organizationId?: string
): Promise<AlertRule[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('alert_rules')
    .select('*')
    .order('created_at', { ascending: false });

  if (organizationId) {
    query = query.or(`user_id.eq.${userId},org_id.eq.${organizationId}`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get alert rules:', error);
    return [];
  }

  return (data || []).map(mapAlertRuleFromDb);
}

/**
 * Create an alert rule
 */
export async function createAlertRule(
  userId: string,
  params: {
    organizationId?: string;
    name: string;
    description?: string;
    severity: AlertSeverity;
    condition: AlertCondition;
    notificationChannels?: string[];
  }
): Promise<AlertRule | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('alert_rules')
    .insert({
      user_id: userId,
      org_id: params.organizationId || null,
      name: params.name,
      description: params.description || null,
      severity: params.severity,
      condition: params.condition,
      notification_channels: params.notificationChannels || [],
      enabled: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create alert rule:', error);
    return null;
  }

  return mapAlertRuleFromDb(data);
}

/**
 * Update an alert rule
 */
export async function updateAlertRule(
  ruleId: string,
  updates: Partial<{
    name: string;
    description: string;
    enabled: boolean;
    severity: AlertSeverity;
    condition: AlertCondition;
    notificationChannels: string[];
    silenceUntil: string;
  }>
): Promise<AlertRule | null> {
  const supabase = createServerClient();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
  if (updates.severity !== undefined) dbUpdates.severity = updates.severity;
  if (updates.condition !== undefined) dbUpdates.condition = updates.condition;
  if (updates.notificationChannels !== undefined) dbUpdates.notification_channels = updates.notificationChannels;
  if (updates.silenceUntil !== undefined) dbUpdates.silence_until = updates.silenceUntil;

  const { data, error } = await supabase
    .from('alert_rules')
    .update(dbUpdates)
    .eq('id', ruleId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update alert rule:', error);
    return null;
  }

  return mapAlertRuleFromDb(data);
}

/**
 * Delete an alert rule
 */
export async function deleteAlertRule(ruleId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('alert_rules')
    .delete()
    .eq('id', ruleId);

  if (error) {
    console.error('Failed to delete alert rule:', error);
    return false;
  }

  return true;
}

// ============================================
// Notification Channels
// ============================================

/**
 * Get notification channels for a user/organization
 */
export async function getNotificationChannels(
  userId: string,
  organizationId?: string
): Promise<NotificationChannel[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('notification_channels')
    .select('*')
    .order('created_at', { ascending: false });

  if (organizationId) {
    query = query.or(`user_id.eq.${userId},org_id.eq.${organizationId}`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get notification channels:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    config: row.config,
    enabled: row.enabled,
    createdAt: row.created_at,
  }));
}

/**
 * Send alert notifications to all configured channels
 */
async function sendAlertNotifications(
  userId: string,
  organizationId: string | undefined,
  alert: Alert
): Promise<void> {
  const channels = await getNotificationChannels(userId, organizationId);

  for (const channel of channels.filter((c) => c.enabled)) {
    try {
      await sendToChannel(channel, alert);
    } catch (err) {
      console.error(`Failed to send alert to channel ${channel.name}:`, err);
    }
  }
}

/**
 * Send alert to a specific notification channel
 */
async function sendToChannel(
  channel: NotificationChannel,
  alert: Alert
): Promise<void> {
  switch (channel.type) {
    case 'email':
      // Email notification (integrate with Resend)
      console.log(`[Email] Alert: ${alert.name} - ${alert.description}`);
      break;

    case 'slack':
      // Slack webhook
      if (channel.config.webhookUrl) {
        const webhookUrl = await normalizeOutboundWebhookUrl(channel.config.webhookUrl, {
          label: 'Control Tower Slack webhook',
        });
        if (!webhookUrl) break;

        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 *Alert: ${alert.name}*\n${alert.description}\nSeverity: ${alert.severity}`,
          }),
        });
      }
      break;

    case 'webhook':
      // Generic webhook
      if (channel.config.url) {
        const webhookUrl = await normalizeOutboundWebhookUrl(channel.config.url, {
          label: 'Control Tower generic webhook',
        });
        if (!webhookUrl) break;

        await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(channel.config.headers as Record<string, string> || {}),
          },
          body: JSON.stringify({ alert }),
        });
      }
      break;

    case 'telegram':
      // Telegram bot
      if (channel.config.botToken && channel.config.chatId) {
        const message = `🚨 Alert: ${alert.name}\n${alert.description}\nSeverity: ${alert.severity}`;
        await fetch(
          `https://api.telegram.org/bot${channel.config.botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: channel.config.chatId,
              text: message,
            }),
          }
        );
      }
      break;

    default:
      console.log(`Unknown channel type: ${channel.type}`);
  }
}

// ============================================
// Helper Functions
// ============================================

function generateAlertFingerprint(
  name: string,
  source: string,
  labels?: Record<string, string>
): string {
  const data = JSON.stringify({ name, source, labels: labels || {} });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

function mapAlertFromDb(row: Record<string, unknown>): Alert {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    severity: row.severity as AlertSeverity,
    status: row.status as AlertStatus,
    source: row.source as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    resolvedAt: row.resolved_at as string | undefined,
    acknowledgedBy: row.acknowledged_by as string | undefined,
    acknowledgedAt: row.acknowledged_at as string | undefined,
    labels: (row.labels as Record<string, string>) || {},
    annotations: (row.annotations as Record<string, string>) || {},
    fingerprint: row.fingerprint as string,
  };
}

function mapAlertRuleFromDb(row: Record<string, unknown>): AlertRule {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    enabled: row.enabled as boolean,
    severity: row.severity as AlertSeverity,
    condition: row.condition as AlertCondition,
    notificationChannels: (row.notification_channels as string[]) || [],
    silenceUntil: row.silence_until as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Evaluate all alert rules against current metrics
 */
export async function evaluateAlertRules(
  userId: string,
  organizationId?: string
): Promise<void> {
  const rules = await getAlertRules(userId, organizationId);
  const enabledRules = rules.filter((r) => r.enabled);

  for (const rule of enabledRules) {
    try {
      const shouldFire = await evaluateCondition(rule.condition, userId, organizationId);

      if (shouldFire) {
        await createAlert({
          userId,
          organizationId,
          ruleId: rule.id,
          name: rule.name,
          description: rule.description || `Alert triggered: ${rule.name}`,
          severity: rule.severity,
          source: 'rule_evaluation',
          labels: { rule_id: rule.id },
        });
      }
    } catch (err) {
      console.error(`Failed to evaluate rule ${rule.id}:`, err);
    }
  }
}

/**
 * Evaluate a single alert condition
 */
async function evaluateCondition(
  condition: AlertCondition,
  _userId: string,
  _organizationId?: string
): Promise<boolean> {
  // Get current metric value
  const supabase = createServerClient();
  const since = new Date(Date.now() - parseDuration(condition.duration)).toISOString();

  const { data } = await supabase
    .from('system_metrics')
    .select('metric_value')
    .eq('metric_name', condition.metric)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false });

  if (!data || data.length === 0) {
    return false;
  }

  // Aggregate values
  let aggregatedValue: number;
  const values = data.map((row) => row.metric_value);

  switch (condition.aggregation || 'avg') {
    case 'sum':
      aggregatedValue = values.reduce((a, b) => a + b, 0);
      break;
    case 'max':
      aggregatedValue = Math.max(...values);
      break;
    case 'min':
      aggregatedValue = Math.min(...values);
      break;
    case 'count':
      aggregatedValue = values.length;
      break;
    case 'avg':
    default:
      aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
  }

  // Compare against threshold
  switch (condition.operator) {
    case 'gt':
      return aggregatedValue > condition.threshold;
    case 'gte':
      return aggregatedValue >= condition.threshold;
    case 'lt':
      return aggregatedValue < condition.threshold;
    case 'lte':
      return aggregatedValue <= condition.threshold;
    case 'eq':
      return aggregatedValue === condition.threshold;
    case 'ne':
      return aggregatedValue !== condition.threshold;
    default:
      return false;
  }
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(m|h|d)$/);
  if (!match) return 300000; // default 5 minutes

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 300000;
  }
}
