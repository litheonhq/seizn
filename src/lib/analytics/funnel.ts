/**
 * Append-only funnel event recorder for the v9 launch analytics.
 *
 * Writes to public.funnel_events (see 20260507007 migration). Triggers on
 * the SQL side reject UPDATE/DELETE so the log is immutable. The helper
 * here is the single entry point — every call site calls
 * `recordFunnelEvent(...)` so we can change instrumentation in one place.
 *
 * Failures are logged and swallowed: instrumentation must never block a
 * user-facing flow. The cron metrics-alert job watches the table itself
 * for missing-event anomalies.
 */

import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';

export type FunnelEventType =
  | 'signup'
  | 'byok_key_added'
  | 'first_extract'
  | 'first_check'
  | 'first_dialog'
  | 'hit_check_limit'
  | 'hit_dialog_limit'
  | 'hit_chapter_limit'
  | 'advanced_feature_blocked'
  | 'subscription_created'
  | 'subscription_canceled'
  | 'charter_swap_to_regular';

export interface FunnelEventInput {
  userId: string;
  eventType: FunnelEventType;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
}

/**
 * Records one funnel event. Idempotency is the caller's responsibility —
 * for "first_*" events, check the funnel_events table first or set a flag
 * in the user's profile.
 *
 * Returns true on success, false on failure (silent — failure is logged).
 */
export async function recordFunnelEvent(input: FunnelEventInput): Promise<boolean> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    return false;
  }
  const supabase = createServerClient();
  const { error } = await supabase
    .from('funnel_events')
    .insert({
      user_id: input.userId,
      event_type: input.eventType,
      metadata: input.metadata ?? null,
      occurred_at: (input.occurredAt ?? new Date()).toISOString(),
    });
  if (error) {
    console.error('[funnel] recordFunnelEvent failed', {
      eventType: input.eventType,
      userId: input.userId,
      error: error.message,
    });
    return false;
  }
  return true;
}

/**
 * Helper for the "first_*" events: only record if the user has never
 * recorded the same event before. Returns true if a new event was written.
 */
export async function recordFirstFunnelEvent(input: FunnelEventInput): Promise<boolean> {
  if (!hasServerSupabaseServiceRoleConfig()) return false;
  const supabase = createServerClient();
  const { data: existing, error: lookupError } = await supabase
    .from('funnel_events')
    .select('id')
    .eq('user_id', input.userId)
    .eq('event_type', input.eventType)
    .limit(1);
  if (lookupError) {
    console.error('[funnel] first-event lookup failed', {
      eventType: input.eventType,
      userId: input.userId,
      error: lookupError.message,
    });
    return false;
  }
  if (existing && existing.length > 0) {
    return false;
  }
  return recordFunnelEvent(input);
}
