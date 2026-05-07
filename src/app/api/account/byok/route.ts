import { NextRequest } from 'next/server';
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
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import { recordFirstFunnelEvent } from '@/lib/analytics/funnel';

export const runtime = 'nodejs';

type ByokProvider = 'anthropic' | 'openai';

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
  return withAuthorUiService(request, async (service, userId) => {
    const body = await readJsonBody(request);
    try {
      const provider = readProviderFromBody(body.provider) ?? 'anthropic';
      const apiKey = typeof body.api_key === 'string' ? body.api_key : '';
      const saved = await saveAuthorByokKey({ userId, provider, apiKey });
      // v9 catalog encodes BYOK pricing as separate Charter price IDs, so
      // the legacy "50% Stripe coupon" discount sync is no longer applied
      // here. (Removed in round 3 cleanup with the byok_discount_* columns.)
      service.saveByok({ ...body, provider });
      // v9 funnel: first BYOK key registration unlocks Free tier and Charter
      // BYOK pricing. Record once per user.
      void recordFirstFunnelEvent({
        userId,
        eventType: 'byok_key_added',
        metadata: { provider },
      });
      return saved;
    } catch (error) {
      if (error instanceof AuthorLlmError && error.status === 400) {
        throw new AuthorUiValidationError(error.message);
      }
      throw error;
    }
  });
}

export async function DELETE(request: NextRequest) {
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

    // Round 3 cleanup: legacy BYOK Stripe coupon sync removed. v9 prices
    // BYOK separately, so deleting a key no longer needs to mutate Stripe.
    // Still report the other provider's status so the UI can stay in sync.
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
      console.error('byok DELETE: failed to read other-provider status, defaulting to inactive', lookupError);
      otherActive = false;
      otherProviderResolved = null;
    }

    if (!otherActive) {
      service.clearByok();
    }
    return {
      enabled: otherActive,
      provider: otherProviderResolved,
      status: otherActive ? 'active' : 'missing',
    };
  });
}
