/**
 * Webhook Event Emission
 *
 * Queues webhook deliveries for matching webhooks when memory events occur.
 * Delivery is handled asynchronously by the cron job (/api/internal/webhooks).
 */

import { createServerClient } from './supabase';

type WebhookEventType = 'memory.created' | 'memory.updated' | 'memory.deleted';

/**
 * Queue webhook deliveries for all matching user webhooks.
 * Non-blocking: errors are logged but don't propagate.
 */
export async function emitWebhookEvent(
  userId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
  namespace?: string
): Promise<void> {
  try {
    const supabase = createServerClient();

    // Find matching active webhooks
    let query = supabase
      .from('webhooks')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .contains('events', [eventType]);

    // Match webhooks with no namespace filter OR matching namespace
    if (namespace) {
      query = query.or(`namespace.eq.${namespace},namespace.is.null`);
    }

    const { data: webhooks } = await query;
    if (!webhooks || webhooks.length === 0) return;

    // Queue deliveries
    const deliveries = webhooks.map((wh) => ({
      webhook_id: wh.id,
      event_type: eventType,
      payload: {
        ...payload,
        event: eventType,
        timestamp: new Date().toISOString(),
      },
      status: 'pending',
      attempt_count: 0,
      max_attempts: 3,
    }));

    const { error } = await supabase.from('webhook_deliveries').insert(deliveries);
    if (error) {
      console.error('[webhook-emit] Failed to queue deliveries:', error);
    }
  } catch (error) {
    console.error('[webhook-emit] Error:', error);
  }
}
