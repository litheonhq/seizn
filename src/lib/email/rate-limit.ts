import { checkCustomRateLimitAsync } from '@/lib/rate-limit';

/**
 * Email rate limit (plan W2.5).
 *
 * Two-tier policy per recipient:
 *   1. Per-type tier — same email + same template once per hour. Stops infinite-loop
 *      abuse where a webhook retries fire repeated welcome/receipt emails.
 *   2. Daily cap   — same email max 5 per 24h across ALL types. Backstop when an
 *      attacker triggers many different templates in a row.
 *
 * Both checks must pass; both increment on `recordEmailSend`.
 */

const PER_TYPE_LIMIT = 1;
const PER_TYPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DAILY_LIMIT = 5;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export type EmailTemplateKey =
  | 'welcome'
  | 'signup_confirm'
  | 'password_reset'
  | 'api_key_created'
  | 'api_key_rotated'
  | 'usage_alert'
  | 'organization_invite'
  | 'weekly_summary'
  | 'enterprise_inquiry'
  | 'payment_receipt'
  | 'payment_failed'
  | 'waitlist_confirm'
  | 'waitlist_followup';

export interface EmailRateLimitResult {
  allowed: boolean;
  reason?: 'per_type_exceeded' | 'daily_exceeded';
  retryAfterMs?: number;
}

function emailKey(email: string, template: EmailTemplateKey, scope: 'type' | 'daily') {
  const normalized = email.trim().toLowerCase();
  return `email:${scope}:${template}:${normalized}`;
}

function dailyKey(email: string) {
  const normalized = email.trim().toLowerCase();
  return `email:daily:any:${normalized}`;
}

export async function checkEmailRateLimit(
  email: string,
  template: EmailTemplateKey
): Promise<EmailRateLimitResult> {
  const perType = await checkCustomRateLimitAsync(
    emailKey(email, template, 'type'),
    PER_TYPE_LIMIT,
    PER_TYPE_WINDOW_MS
  );
  if (!perType.allowed) {
    return {
      allowed: false,
      reason: 'per_type_exceeded',
      retryAfterMs: perType.resetAt - Date.now(),
    };
  }

  const daily = await checkCustomRateLimitAsync(
    dailyKey(email),
    DAILY_LIMIT,
    DAILY_WINDOW_MS
  );
  if (!daily.allowed) {
    return {
      allowed: false,
      reason: 'daily_exceeded',
      retryAfterMs: daily.resetAt - Date.now(),
    };
  }

  return { allowed: true };
}
