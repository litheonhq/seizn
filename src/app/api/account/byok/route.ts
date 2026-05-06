import { NextRequest, NextResponse } from 'next/server';
import {
  AuthorUiValidationError,
  readJsonBody,
  withAuthorUiService,
} from '@/lib/author/ui';
import {
  AuthorLlmError,
  getAuthorByokStatus,
  saveAuthorByokKey,
} from '@/lib/author/llm';
import { getRequestUser } from '@/lib/api/request-user';
import { checkCustomRateLimitAsync, getRateLimitHeaders } from '@/lib/rate-limit';
import { logServerError } from '@/lib/server/logger';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import {
  applyAuthorByokDiscount,
  removeAuthorByokDiscount,
} from '@/lib/stripe/byok-discount';

export const runtime = 'nodejs';

type ByokProvider = 'anthropic' | 'openai';

// Per-user rate limit on BYOK write paths (POST + DELETE). 10/min covers all
// legitimate UX (save / replace / remove); above that is either UI thrash
// (double-click), a session-hijack abuse pattern (spam toggle to confuse
// Stripe coupon reconciliation), or a key-format probe loop. Each call hits
// Stripe (customer / subscription update) so the upstream cost of abuse is
// real even before any DB write. Keyed on userId so attackers cannot share
// the bucket across accounts.
const BYOK_WRITE_RATE_LIMIT = 10;
const BYOK_WRITE_RATE_WINDOW_MS = 60_000;

async function rateLimitByokWrite(request: NextRequest): Promise<NextResponse | null> {
  const user = await getRequestUser(request);
  if (!user?.id) return null; // Auth check happens inside withAuthorUiService.
  const result = await checkCustomRateLimitAsync(
    `byok-write:${user.id}`,
    BYOK_WRITE_RATE_LIMIT,
    BYOK_WRITE_RATE_WINDOW_MS,
  );
  if (result.allowed) return null;
  return NextResponse.json(
    { error: 'Too many BYOK write attempts. Please wait a moment and try again.' },
    { status: 429, headers: getRateLimitHeaders(result) },
  );
}

function readProviderQuery(request: NextRequest): ByokProvider | undefined {
  const value = request.nextUrl.searchParams.get('provider')?.trim().toLowerCase();
  return value === 'openai' || value === 'anthropic' ? value : undefined;
}

function readProviderFromBody(value: unknown): ByokProvider | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === 'openai' || normalized === 'anthropic' ? normalized : undefined;
}

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (service, userId) => {
    const provider = readProviderQuery(request);
    const status = await getAuthorByokStatus(userId, undefined, provider ? { provider } : {});
    return status.status === 'missing' ? service.getByok() : status;
  });
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitByokWrite(request);
  if (limited) return limited;
  return withAuthorUiService(request, async (service, userId) => {
    const body = await readJsonBody(request);
    try {
      const provider = readProviderFromBody(body.provider) ?? 'anthropic';
      const apiKey = typeof body.api_key === 'string' ? body.api_key : '';
      const saved = await saveAuthorByokKey({ userId, provider, apiKey });
      // BYOK 50% discount applies the moment any author-stack key is registered;
      // saving an OpenAI key on top of an Anthropic one (or vice versa) is a
      // no-op for the discount sync.
      const discount = await applyAuthorByokDiscount(userId);
      service.saveByok({ ...body, provider });
      return {
        ...saved,
        byok_discount: discount,
      };
    } catch (error) {
      if (error instanceof AuthorLlmError && error.status === 400) {
        throw new AuthorUiValidationError(error.message);
      }
      throw error;
    }
  });
}

export async function DELETE(request: NextRequest) {
  const limited = await rateLimitByokWrite(request);
  if (limited) return limited;
  return withAuthorUiService(request, async (service, userId) => {
    const targetProvider: ByokProvider = readProviderQuery(request) ?? 'anthropic';
    if (hasServerSupabaseServiceRoleConfig()) {
      const supabase = createServerClient();
      await supabase
        .from('provider_keys')
        .update({ is_active: false, is_default: false })
        .eq('user_id', userId)
        .eq('provider', targetProvider);
    }

    // Drop the discount only when the user is removing the LAST remaining
    // author-stack key. We re-read the other provider's status; if it's still
    // active, keep the discount. If the lookup itself fails (transient
    // Supabase outage), fail CLOSED — assume no other key is active and remove
    // the discount. Discount can be re-applied on the next BYOK save; leaving
    // it stale would mean Litheon eats the 50% indefinitely.
    const otherProvider: ByokProvider = targetProvider === 'anthropic' ? 'openai' : 'anthropic';
    let otherActive = false;
    let otherProviderResolved: ByokProvider | null = null;
    try {
      const otherStatus = await getAuthorByokStatus(userId, undefined, { provider: otherProvider });
      otherActive = otherStatus.status === 'active';
      // AuthorByokStatus.provider has a wider union ('google' included) but the
      // author stack only ever stores Anthropic / OpenAI keys today.
      const p = otherStatus.provider;
      otherProviderResolved = otherActive && (p === 'anthropic' || p === 'openai') ? p : null;
    } catch (lookupError) {
      logServerError(
        'byok DELETE: failed to read other-provider status, defaulting to inactive',
        lookupError,
        { otherProvider, targetProvider },
      );
      otherActive = false;
      otherProviderResolved = null;
    }

    const discount = otherActive
      ? { coupon: '', status: 'applied' as const, applied: true }
      : await removeAuthorByokDiscount(userId);
    if (!otherActive) {
      service.clearByok();
    }
    return {
      enabled: otherActive,
      provider: otherProviderResolved,
      status: otherActive ? 'active' : 'missing',
      byok_discount: discount,
    };
  });
}
