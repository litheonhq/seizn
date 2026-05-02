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

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (service, userId) => {
    const status = await getAuthorByokStatus(userId);
    return status.status === 'missing' ? service.getByok() : status;
  });
}

export async function POST(request: NextRequest) {
  return withAuthorUiService(request, async (service, userId) => {
    const body = await readJsonBody(request);
    try {
      const provider = typeof body.provider === 'string' ? body.provider : '';
      const apiKey = typeof body.api_key === 'string' ? body.api_key : '';
      const saved = await saveAuthorByokKey({ userId, provider, apiKey });
      const discount = await applyAuthorByokDiscount(userId);
      service.saveByok(body);
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
    if (hasServerSupabaseServiceRoleConfig()) {
      const supabase = createServerClient();
      await supabase
        .from('provider_keys')
        .update({ is_active: false, is_default: false })
        .eq('user_id', userId)
        .eq('provider', 'anthropic');
    }

    const discount = await removeAuthorByokDiscount(userId);
    service.clearByok();
    return {
      enabled: false,
      provider: null,
      status: 'missing',
      byok_discount: discount,
    };
  });
}
