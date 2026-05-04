/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase';
import { normalizeOutboundWebhookUrl } from '@/lib/security/outbound-webhook';

// ============================================
// Types
// ============================================

export interface RegressionCheckParams {
  userId: string;
  datasetId: string;
  metricKey: string; // e.g. avg_context_precision
  dropThreshold: number; // e.g. 0.02 means -2% absolute
}

export interface RegressionCheckResult {
  baselineRunId?: string;
  candidateRunId?: string;
  baselineValue?: number;
  candidateValue?: number;
  delta?: number;
  isRegression: boolean;
}

export interface RegressionEvent {
  id?: string;
  userId: string;
  datasetId: string;
  baselineRunId: string;
  candidateRunId: string;
  metricKey: string;
  baselineValue: number;
  candidateValue: number;
  delta: number;
  severity: 'warning' | 'critical';
  acknowledged: boolean;
  createdAt?: string;
}

export interface SlackNotificationParams {
  webhookUrl: string;
  event: RegressionEvent;
  datasetName?: string;
  dashboardUrl?: string;
}

export interface RegressionAlarmConfig {
  /** Metric keys to monitor (e.g., ['avg_context_precision', 'avg_faithfulness']) */
  metricKeys: string[];
  /** Threshold for warning (e.g., 0.02 = -2% drop) */
  warningThreshold: number;
  /** Threshold for critical (e.g., 0.05 = -5% drop) */
  criticalThreshold: number;
  /** Slack webhook URL for notifications (optional) */
  slackWebhookUrl?: string;
  /** Dashboard URL for links in notifications */
  dashboardUrl?: string;
}

// ============================================
// Core Functions
// ============================================

/**
 * MVP regression detector:
 * - Finds two most recent successful runs
 * - Compares `summary_metrics[metricKey]`
 */
export async function detectRegression(params: RegressionCheckParams): Promise<RegressionCheckResult> {
  const supabase = createServerClient();

  const { data: runs, error } = await supabase
    .from('fall_eval_runs')
    .select('id, summary_metrics, finished_at')
    .eq('user_id', params.userId)
    .eq('dataset_id', params.datasetId)
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(2);

  if (error) throw error;

  if (!runs || runs.length < 2) {
    return { isRegression: false };
  }

  const [latest, previous] = runs;

  const candidateValue = Number(latest?.summary_metrics?.[params.metricKey]);
  const baselineValue = Number(previous?.summary_metrics?.[params.metricKey]);

  if (!Number.isFinite(candidateValue) || !Number.isFinite(baselineValue)) {
    return { isRegression: false };
  }

  const delta = candidateValue - baselineValue;
  const isRegression = delta < -Math.abs(params.dropThreshold);

  return {
    baselineRunId: previous.id,
    candidateRunId: latest.id,
    baselineValue,
    candidateValue,
    delta,
    isRegression,
  };
}

/**
 * Run regression check for multiple metrics and persist events
 */
export async function checkAndPersistRegressions(params: {
  userId: string;
  datasetId: string;
  config: RegressionAlarmConfig;
}): Promise<RegressionEvent[]> {
  const { userId, datasetId, config } = params;
  const events: RegressionEvent[] = [];

  for (const metricKey of config.metricKeys) {
    // Check for critical first, then warning
    const criticalResult = await detectRegression({
      userId,
      datasetId,
      metricKey,
      dropThreshold: config.criticalThreshold,
    });

    if (criticalResult.isRegression) {
      const event = await persistRegressionEvent({
        userId,
        datasetId,
        baselineRunId: criticalResult.baselineRunId!,
        candidateRunId: criticalResult.candidateRunId!,
        metricKey,
        baselineValue: criticalResult.baselineValue!,
        candidateValue: criticalResult.candidateValue!,
        delta: criticalResult.delta!,
        severity: 'critical',
        acknowledged: false,
      });
      events.push(event);
      continue;
    }

    // Check for warning level
    const warningResult = await detectRegression({
      userId,
      datasetId,
      metricKey,
      dropThreshold: config.warningThreshold,
    });

    if (warningResult.isRegression) {
      const event = await persistRegressionEvent({
        userId,
        datasetId,
        baselineRunId: warningResult.baselineRunId!,
        candidateRunId: warningResult.candidateRunId!,
        metricKey,
        baselineValue: warningResult.baselineValue!,
        candidateValue: warningResult.candidateValue!,
        delta: warningResult.delta!,
        severity: 'warning',
        acknowledged: false,
      });
      events.push(event);
    }
  }

  // Send Slack notifications for any events
  if (config.slackWebhookUrl && events.length > 0) {
    for (const event of events) {
      await sendSlackNotification({
        webhookUrl: config.slackWebhookUrl,
        event,
        dashboardUrl: config.dashboardUrl,
      }).catch((err) => {
        console.error('Failed to send Slack notification:', err);
      });
    }
  }

  return events;
}

// ============================================
// Database Persistence
// ============================================

/**
 * Persist a regression event to the database
 */
export async function persistRegressionEvent(
  event: Omit<RegressionEvent, 'id' | 'createdAt'>
): Promise<RegressionEvent> {
  const supabase = createServerClient();

  const payload = {
    user_id: event.userId,
    dataset_id: event.datasetId,
    baseline_run_id: event.baselineRunId,
    candidate_run_id: event.candidateRunId,
    metric_key: event.metricKey,
    baseline_value: event.baselineValue,
    candidate_value: event.candidateValue,
    delta: event.delta,
    severity: event.severity,
    acknowledged: event.acknowledged,
  };

  const { data, error } = await supabase
    .from('fall_eval_regression_events')
    .insert(payload)
    .select('id, created_at')
    .single();

  if (error) {
    // If table doesn't exist, log and return a mock event
    console.warn('Regression events table may not exist:', error.message);
    return {
      ...event,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
  }

  return {
    ...event,
    id: data.id,
    createdAt: data.created_at,
  };
}

/**
 * List regression events for a user/dataset
 */
export async function listRegressionEvents(params: {
  userId: string;
  datasetId?: string;
  limit?: number;
  acknowledged?: boolean;
}): Promise<RegressionEvent[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('fall_eval_regression_events')
    .select('*')
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50);

  if (params.datasetId) {
    query = query.eq('dataset_id', params.datasetId);
  }

  if (typeof params.acknowledged === 'boolean') {
    query = query.eq('acknowledged', params.acknowledged);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('Failed to list regression events:', error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    datasetId: row.dataset_id,
    baselineRunId: row.baseline_run_id,
    candidateRunId: row.candidate_run_id,
    metricKey: row.metric_key,
    baselineValue: row.baseline_value,
    candidateValue: row.candidate_value,
    delta: row.delta,
    severity: row.severity,
    acknowledged: row.acknowledged,
    createdAt: row.created_at,
  }));
}

/**
 * Acknowledge a regression event
 */
export async function acknowledgeRegressionEvent(eventId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('fall_eval_regression_events')
    .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) {
    console.error('Failed to acknowledge regression event:', error.message);
    return false;
  }

  return true;
}

// ============================================
// Slack Notifications
// ============================================

/**
 * Send a Slack notification for a regression event
 */
export async function sendSlackNotification(params: SlackNotificationParams): Promise<boolean> {
  const { webhookUrl, event, datasetName, dashboardUrl } = params;

  const emoji = event.severity === 'critical' ? ':rotating_light:' : ':warning:';
  const color = event.severity === 'critical' ? '#dc3545' : '#ffc107';
  const percentDelta = (event.delta * 100).toFixed(2);

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} Eval Regression Detected`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Metric:*\n${event.metricKey}`,
        },
        {
          type: 'mrkdwn',
          text: `*Severity:*\n${event.severity.toUpperCase()}`,
        },
        {
          type: 'mrkdwn',
          text: `*Baseline:*\n${event.baselineValue.toFixed(4)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Current:*\n${event.candidateValue.toFixed(4)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Delta:*\n${percentDelta}%`,
        },
        {
          type: 'mrkdwn',
          text: `*Dataset:*\n${datasetName ?? event.datasetId.slice(0, 8)}`,
        },
      ],
    },
  ];

  // Add dashboard link if provided
  if (dashboardUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${dashboardUrl}/eval/runs/${event.candidateRunId}|View in Dashboard>`,
      },
    } as any);
  }

  const payload = {
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };

  try {
    const safeWebhookUrl = await normalizeOutboundWebhookUrl(webhookUrl, {
      label: 'Fall eval Slack webhook',
    });
    if (!safeWebhookUrl) return false;

    const response = await fetch(safeWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Slack webhook failed:', response.status, await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('Slack notification error:', err);
    return false;
  }
}

// ============================================
// Auto-check after eval run
// ============================================

/**
 * Default alarm configuration
 */
export const DEFAULT_ALARM_CONFIG: RegressionAlarmConfig = {
  metricKeys: ['avg_context_precision', 'avg_context_recall', 'avg_mrr', 'avg_faithfulness'],
  warningThreshold: 0.02, // -2%
  criticalThreshold: 0.05, // -5%
};

/**
 * Run regression check after an eval completes
 * Call this from the eval runner or API endpoint
 */
export async function runPostEvalRegressionCheck(params: {
  userId: string;
  datasetId: string;
  runId: string;
  config?: Partial<RegressionAlarmConfig>;
}): Promise<{
  checked: boolean;
  events: RegressionEvent[];
}> {
  const config: RegressionAlarmConfig = {
    ...DEFAULT_ALARM_CONFIG,
    ...params.config,
  };

  // Check for Slack webhook in environment if not provided
  if (!config.slackWebhookUrl) {
    config.slackWebhookUrl = process.env.EVAL_SLACK_WEBHOOK_URL;
  }

  if (!config.dashboardUrl) {
    config.dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.seizn.com';
  }

  const events = await checkAndPersistRegressions({
    userId: params.userId,
    datasetId: params.datasetId,
    config,
  });

  return {
    checked: true,
    events,
  };
}
