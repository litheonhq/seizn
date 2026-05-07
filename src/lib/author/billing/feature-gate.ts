/**
 * Free tier feature gate for Author Memory v3 (v9 launch).
 *
 * Locked 2026-05-07. Encodes the v9 Free tier limits:
 *   - 5 Check operations per calendar month
 *   - 5 Dialog generations per calendar month
 *   - First 5 chapters / 25,000 words analyzed (extract scope)
 *   - Backlog generation, knowledge partitioning, timeline / relationship
 *     extraction blocked entirely (Charter-only)
 *
 * Charter tiers (BYOK and Managed) bypass all feature gates. The gate
 * checks public.profiles.plan to determine entitlement.
 *
 * Counters live in public.feature_usage_log keyed by (user_id, feature,
 * period_start). period_start is the first day of the calendar month UTC.
 *
 * The recordFeatureUsage() helper increments after a successful operation;
 * the gate read is BEFORE the operation. Race condition between read and
 * increment is acceptable — at worst a Free user gets one extra call in a
 * concurrent burst, which is not security-sensitive.
 */

import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import { isAuthorBillingTier } from '@/lib/stripe-config';
import { recordFunnelEvent } from '@/lib/analytics/funnel';

export type GatedFeature = 'check' | 'dialog' | 'extract' | 'backlog';

export type FeatureGateDecision =
  | { allowed: true; remaining: number | null; cap: number | null; reason?: never }
  | { allowed: false; remaining: 0; cap: number; reason: GateRejectReason };

export type GateRejectReason =
  | 'free_check_limit_exceeded'
  | 'free_dialog_limit_exceeded'
  | 'free_extract_chapter_limit_exceeded'
  | 'free_extract_word_limit_exceeded'
  | 'feature_charter_only';

interface GateContext {
  userId: string;
  feature: GatedFeature;
  /** For extract: total chapter count being processed in the request. */
  chapterCount?: number;
  /** For extract: total word count being processed. */
  wordCount?: number;
  /** Optional: skip funnel recording (test path or repeated checks). */
  silent?: boolean;
}

const FREE_LIMITS = {
  checkPerMonth: 5,
  dialogPerMonth: 5,
  extractMaxChapters: 5,
  extractMaxWords: 25_000,
  // Backlog generation, knowledge partitioning, timeline / relationship
  // extraction are Charter-only — no quota counter, just blocked.
} as const;

const CHARTER_ONLY_FEATURES: GatedFeature[] = ['backlog'];

/**
 * Returns whether the user can run `feature` right now. For metered features
 * (check, dialog) returns the remaining calls in the current month; for
 * extract returns null because the cap is per-call (chapter/word) not
 * per-month.
 */
export async function checkFeatureGate(ctx: GateContext): Promise<FeatureGateDecision> {
  const tier = await readUserTier(ctx.userId);
  const isPaid = tier !== null;

  // Paid tiers (any Charter) bypass all gates.
  if (isPaid) {
    return { allowed: true, remaining: null, cap: null };
  }

  // Charter-only features are blocked entirely on Free.
  if (CHARTER_ONLY_FEATURES.includes(ctx.feature)) {
    if (!ctx.silent) {
      void recordFunnelEvent({
        userId: ctx.userId,
        eventType: 'advanced_feature_blocked',
        metadata: { feature: ctx.feature },
      });
    }
    return {
      allowed: false,
      remaining: 0,
      cap: 0,
      reason: 'feature_charter_only',
    };
  }

  if (ctx.feature === 'extract') {
    return checkExtractScope(ctx);
  }

  if (ctx.feature === 'check' || ctx.feature === 'dialog') {
    return checkMonthlyLimit(ctx);
  }

  // Unknown feature — allow by default.
  return { allowed: true, remaining: null, cap: null };
}

/**
 * Increments the counter for `feature`. Caller invokes this AFTER a
 * successful operation. No-op for Charter tiers.
 *
 * Uses the increment_feature_usage RPC (atomic INSERT … ON CONFLICT DO
 * UPDATE SET count = count + 1) — calling Supabase upsert directly with
 * `count: 1` would overwrite the existing count back to 1, defeating the
 * monthly cap entirely (caught in audit round 3).
 */
export async function recordFeatureUsage(ctx: GateContext): Promise<void> {
  if (!hasServerSupabaseServiceRoleConfig()) return;
  const tier = await readUserTier(ctx.userId);
  if (tier !== null) return; // Charter — no counter.
  if (ctx.feature !== 'check' && ctx.feature !== 'dialog') return;

  const supabase = createServerClient();
  const periodStart = currentMonthStartUtc();
  const { error } = await supabase.rpc('increment_feature_usage', {
    p_user_id: ctx.userId,
    p_feature: ctx.feature,
    p_period_start: periodStart,
  });
  if (error) {
    console.error('[feature-gate] usage increment failed', {
      userId: ctx.userId,
      feature: ctx.feature,
      error: error.message,
    });
  }
}

async function checkMonthlyLimit(ctx: GateContext): Promise<FeatureGateDecision> {
  const cap = ctx.feature === 'check' ? FREE_LIMITS.checkPerMonth : FREE_LIMITS.dialogPerMonth;
  const used = await readUsageCount(ctx.userId, ctx.feature);
  const remaining = Math.max(0, cap - used);
  if (remaining > 0) {
    return { allowed: true, remaining, cap };
  }
  if (!ctx.silent) {
    void recordFunnelEvent({
      userId: ctx.userId,
      eventType: ctx.feature === 'check' ? 'hit_check_limit' : 'hit_dialog_limit',
      metadata: { used, cap },
    });
  }
  return {
    allowed: false,
    remaining: 0,
    cap,
    reason: ctx.feature === 'check'
      ? 'free_check_limit_exceeded'
      : 'free_dialog_limit_exceeded',
  };
}

function checkExtractScope(ctx: GateContext): FeatureGateDecision {
  if ((ctx.chapterCount ?? 0) > FREE_LIMITS.extractMaxChapters) {
    if (!ctx.silent) {
      void recordFunnelEvent({
        userId: ctx.userId,
        eventType: 'hit_chapter_limit',
        metadata: {
          requested: ctx.chapterCount,
          cap: FREE_LIMITS.extractMaxChapters,
        },
      });
    }
    return {
      allowed: false,
      remaining: 0,
      cap: FREE_LIMITS.extractMaxChapters,
      reason: 'free_extract_chapter_limit_exceeded',
    };
  }
  if ((ctx.wordCount ?? 0) > FREE_LIMITS.extractMaxWords) {
    if (!ctx.silent) {
      void recordFunnelEvent({
        userId: ctx.userId,
        eventType: 'hit_chapter_limit',
        metadata: {
          requested_words: ctx.wordCount,
          cap_words: FREE_LIMITS.extractMaxWords,
        },
      });
    }
    return {
      allowed: false,
      remaining: 0,
      cap: FREE_LIMITS.extractMaxWords,
      reason: 'free_extract_word_limit_exceeded',
    };
  }
  return { allowed: true, remaining: null, cap: null };
}

async function readUserTier(userId: string): Promise<string | null> {
  if (!hasServerSupabaseServiceRoleConfig()) return null;
  const supabase = createServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single<{ plan: string | null }>();
  const plan = data?.plan ?? null;
  return isAuthorBillingTier(plan) ? plan : null;
}

async function readUsageCount(userId: string, feature: GatedFeature): Promise<number> {
  if (!hasServerSupabaseServiceRoleConfig()) return 0;
  const supabase = createServerClient();
  const { data } = await supabase
    .from('feature_usage_log')
    .select('count')
    .eq('user_id', userId)
    .eq('feature', feature)
    .eq('period_start', currentMonthStartUtc())
    .maybeSingle<{ count: number }>();
  return data?.count ?? 0;
}

function currentMonthStartUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export const FREE_TIER_LIMITS = FREE_LIMITS;
