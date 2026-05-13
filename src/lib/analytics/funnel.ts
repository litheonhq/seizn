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
  | 'byok_test_attempt'
  | 'first_extract'
  | 'first_check'
  | 'first_dialog'
  | 'first_coach_analyze'
  | 'hit_check_limit'
  | 'hit_dialog_limit'
  | 'hit_chapter_limit'
  | 'advanced_feature_blocked'
  | 'subscription_created'
  | 'subscription_canceled'
  | 'charter_swap_to_regular';

export const FUNNEL_EVENT_TYPES: readonly FunnelEventType[] = [
  'signup',
  'byok_key_added',
  'byok_test_attempt',
  'first_extract',
  'first_check',
  'first_dialog',
  'first_coach_analyze',
  'hit_check_limit',
  'hit_dialog_limit',
  'hit_chapter_limit',
  'advanced_feature_blocked',
  'subscription_created',
  'subscription_canceled',
  'charter_swap_to_regular',
] as const;

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
 *
 * Uses INSERT ... ON CONFLICT DO NOTHING against the partial unique index
 * funnel_events_first_unique (migration 20260514002). Eliminates the race
 * window the older SELECT-then-INSERT version had — two concurrent first
 * actions can no longer both succeed.
 */
export async function recordFirstFunnelEvent(input: FunnelEventInput): Promise<boolean> {
  if (!hasServerSupabaseServiceRoleConfig()) return false;
  const supabase = createServerClient();
  try {
    const { data, error } = await supabase
      .from('funnel_events')
      .insert({
        user_id: input.userId,
        event_type: input.eventType,
        metadata: input.metadata ?? null,
        occurred_at: (input.occurredAt ?? new Date()).toISOString(),
      })
      .select('id');
    if (error) {
      // PostgreSQL unique-violation (SQLSTATE 23505) means the partial unique
      // index funnel_events_first_unique (migration 20260514002) caught a
      // concurrent duplicate. Treat as "already first" — return false, no log.
      if (error.code === '23505') return false;
      console.error('[funnel] first-event insert failed', {
        eventType: input.eventType,
        userId: input.userId,
        error: error.message,
      });
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    // Defensive: never let instrumentation throw into the calling flow.
    console.error('[funnel] first-event insert threw', {
      eventType: input.eventType,
      userId: input.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
