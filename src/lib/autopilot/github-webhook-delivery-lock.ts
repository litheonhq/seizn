import type { GitHubWebhookEvent, WebhookPayload } from '@/lib/autopilot';

type WebhookLockStatus = {
  processed: boolean;
  processed_at: string | null;
  result: unknown;
};

type WebhookProcessResult = {
  processed: boolean;
  action?: string;
  error?: string;
};

const WEBHOOK_LOCK_STALE_MS = 5 * 60 * 1000;

export async function upsertWebhookEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  deliveryId: string,
  eventType: GitHubWebhookEvent,
  repoFullName: string,
  webhookPayload: WebhookPayload
): Promise<void> {
  await supabase
    .from('autopilot_webhooks')
    .upsert(
      {
        id: deliveryId,
        event: eventType,
        repository: repoFullName,
        payload: webhookPayload,
        processed: false,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
}

export async function claimWebhookDelivery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  deliveryId: string
): Promise<{ acquired: true; processorId: string } | { acquired: false; status: WebhookLockStatus | null }> {
  const processorId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const lockPayload = {
    processed_at: nowIso,
    result: {
      state: 'processing',
      processorId,
      startedAt: nowIso,
    },
  };

  const { data: claimedNow, error: claimErrorNow } = await supabase
    .from('autopilot_webhooks')
    .update(lockPayload)
    .eq('id', deliveryId)
    .eq('processed', false)
    .is('processed_at', null)
    .select('id')
    .maybeSingle();

  if (claimErrorNow) {
    throw claimErrorNow;
  }

  if (claimedNow) {
    return { acquired: true, processorId };
  }

  const staleBefore = new Date(Date.now() - WEBHOOK_LOCK_STALE_MS).toISOString();
  const { data: reclaimed, error: reclaimError } = await supabase
    .from('autopilot_webhooks')
    .update(lockPayload)
    .eq('id', deliveryId)
    .eq('processed', false)
    .lt('processed_at', staleBefore)
    .select('id')
    .maybeSingle();

  if (reclaimError) {
    throw reclaimError;
  }

  if (reclaimed) {
    return { acquired: true, processorId };
  }

  const { data: status } = await supabase
    .from('autopilot_webhooks')
    .select('processed, processed_at, result')
    .eq('id', deliveryId)
    .maybeSingle();

  return {
    acquired: false,
    status: (status as WebhookLockStatus | null) ?? null,
  };
}

export async function finalizeWebhookDelivery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  deliveryId: string,
  processorId: string,
  result: WebhookProcessResult
): Promise<void> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('autopilot_webhooks')
    .update({
      processed: result.processed,
      result,
      processed_at: result.processed ? nowIso : null,
    })
    .eq('id', deliveryId)
    .contains('result', { processorId })
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Failed to finalize webhook delivery lock for ${deliveryId}`);
  }
}
