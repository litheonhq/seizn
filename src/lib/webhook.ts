// Webhook delivery service for Seizn

import crypto from 'crypto';
import dns from 'dns/promises';
import { isIP } from 'net';
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

/** Validate webhook URL and block private/internal IPs (SSRF prevention). */
export function isValidWebhookUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    // Strip brackets from IPv6 hostname (e.g. [::ffff:127.0.0.1] -> ::ffff:127.0.0.1)
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    // Block well-known private/internal addresses
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'].includes(host)) return false;
    // Block IPv4 private ranges
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    // Block IPv6-mapped IPv4 private addresses (::ffff:10.x.x.x, ::ffff:127.x.x.x, etc.)
    const v4Mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Mapped) {
      const ipv4 = v4Mapped[1];
      if (ipv4.startsWith('10.') || ipv4.startsWith('127.') || ipv4.startsWith('192.168.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(ipv4) || ipv4 === '0.0.0.0' || ipv4 === '169.254.169.254') {
        return false;
      }
    }
    // Block IPv6 link-local (fe80::), unique local (fc00::/fd::), loopback, multicast (ff00::)
    if (/^(fe80|fc|fd|ff)[0-9a-f]*:/.test(host) || host === '::' || host === '::1') return false;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
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

  // SSRF check before delivery (URL-level)
  if (!isValidWebhookUrl(webhook.url)) {
    return { success: false, error: 'Webhook URL blocked by SSRF policy' };
  }

  // DNS rebinding defense: resolve hostname and verify resolved IPs are not private.
  const url = new URL(webhook.url);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  // Only resolve DNS for hostnames (not IPv4/IPv6 literals).
  if (isIP(hostname) === 0) {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const resolvedIps = [...addresses, ...addresses6];

    // Fail closed when hostname cannot be resolved.
    if (resolvedIps.length === 0) {
      return { success: false, error: 'Webhook hostname resolution failed' };
    }

    for (const ip of resolvedIps) {
      if (!isValidWebhookUrl(`https://${ip.includes(':') ? `[${ip}]` : ip}/`)) {
        return { success: false, error: 'Webhook URL resolved to blocked IP address' };
      }
    }
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
