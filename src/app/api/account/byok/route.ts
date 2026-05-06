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
import {
  applyAuthorByokDiscount,
  removeAuthorByokDiscount,
} from '@/lib/stripe/byok-discount';

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
  return withAuthorUiService(request, async (service, userId) => {
    const targetProvider: ByokProvider = readProviderQuery(request) ?? 'anthropic';

    // Step 1: deactivate the keys for the requested provider. CHECK the error
    // — if the update silently fails, the key remains active in the DB but we
    // would still proceed to remove the Stripe coupon. End state: user keeps
    // using BYOK at full price (no discount + still-active key). Bail with a
    // 503-equivalent so the dashboard retries instead of corrupting state.
    if (hasServerSupabaseServiceRoleConfig()) {
      const supabase = createServerClient();
      const { error: updateError } = await supabase
        .from('provider_keys')
        .update({ is_active: false, is_default: false })
        .eq('user_id', userId)
        .eq('provider', targetProvider);
      if (updateError) {
        throw new AuthorLlmError(
          'LLM_NOT_CONFIGURED',
          'Failed to deactivate BYOK key — please retry',
          503,
        );
      }
    }

    // Step 2: figure out whether the OTHER provider is still active so we
    // know whether to drop the BYOK 50% Stripe coupon.
    //
    // Only drop the coupon when we're CONFIDENT no key remains. If the
    // status read itself fails (transient Supabase outage), we cannot
    // distinguish "user has no other key" from "DB is unreachable" — both
    // would have returned 'missing' under the old code, then dropped the
    // coupon. That's fail-OPEN against Litheon if the user actually does
    // still have an OpenAI key: they keep BYOK + lose the discount =
    // billed full price for managed-LLM consumption they aren't doing.
    //
    // Better: surface the failure (503) and let the dashboard retry. Coupon
    // state stays consistent until we have a reliable answer. Webhook /
    // scheduled reconciliation can clean up if the user gives up retrying.
    const otherProvider: ByokProvider = targetProvider === 'anthropic' ? 'openai' : 'anthropic';
    const otherStatus = await getAuthorByokStatus(userId, undefined, { provider: otherProvider });
    const otherActive = otherStatus.status === 'active';
    const otherProviderResolved: ByokProvider | null =
      otherActive && (otherStatus.provider === 'anthropic' || otherStatus.provider === 'openai')
        ? otherStatus.provider
        : null;

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
