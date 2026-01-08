// Webhook delivery service for Seizn

import crypto from 'crypto';
import { createServerClient } from './supabase';

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempt_count: number;
  max_attempts: number;
}

interface WebhookConfig {
  id: string;
  url: string;
  secret: string | null;
}

// Generate HMAC signature for webhook payload
export function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Deliver a single webhook
export async function deliverWebhook(
  delivery: WebhookDelivery,
  webhook: WebhookConfig
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const payloadString = JSON.stringify(delivery.payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Seizn-Event': delivery.event_type,
    'X-Seizn-Delivery': delivery.id,
    'X-Seizn-Timestamp': new Date().toISOString(),
  };

  // Add signature if secret is configured
  if (webhook.secret) {
    headers['X-Seizn-Signature'] = `sha256=${generateSignature(payloadString, webhook.secret)}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseText = await response.text().catch(() => '');

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : responseText.slice(0, 500),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Process pending webhook deliveries
export async function processPendingWebhooks(limit: number = 50): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const supabase = createServerClient();

  // Get pending deliveries
  const { data: deliveries, error: fetchError } = await supabase
    .from('webhook_deliveries')
    .select(`
      id,
      webhook_id,
      event_type,
      payload,
      status,
      attempt_count,
      max_attempts,
      webhooks!inner (
        id,
        url,
        secret,
        is_active
      )
    `)
    .or('status.eq.pending,and(status.eq.failed,attempt_count.lt.max_attempts,next_retry_at.lte.now())')
    .limit(limit);

  if (fetchError || !deliveries) {
    console.error('Failed to fetch webhook deliveries:', fetchError);
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webhook = (delivery as any).webhooks;

    // Skip if webhook is inactive
    if (!webhook?.is_active) {
      continue;
    }

    const result = await deliverWebhook(
      delivery as WebhookDelivery,
      webhook as WebhookConfig
    );

    const newAttemptCount = delivery.attempt_count + 1;

    if (result.success) {
      // Mark as succeeded
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'success',
          status_code: result.statusCode,
          attempt_count: newAttemptCount,
          delivered_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);

      succeeded++;
    } else {
      // Mark as failed or schedule retry
      const isFinalAttempt = newAttemptCount >= delivery.max_attempts;

      // Exponential backoff: 1min, 5min, 30min
      const retryDelays = [60, 300, 1800];
      const retryDelay = retryDelays[Math.min(newAttemptCount - 1, retryDelays.length - 1)];

      await supabase
        .from('webhook_deliveries')
        .update({
          status: isFinalAttempt ? 'failed' : 'pending',
          status_code: result.statusCode,
          error_message: result.error,
          attempt_count: newAttemptCount,
          next_retry_at: isFinalAttempt
            ? null
            : new Date(Date.now() + retryDelay * 1000).toISOString(),
        })
        .eq('id', delivery.id);

      failed++;
    }
  }

  return {
    processed: deliveries.length,
    succeeded,
    failed,
  };
}

// Get webhook delivery history for a webhook
export async function getDeliveryHistory(
  webhookId: string,
  limit: number = 20
): Promise<WebhookDelivery[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('webhook_id', webhookId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch delivery history:', error);
    return [];
  }

  return data || [];
}
