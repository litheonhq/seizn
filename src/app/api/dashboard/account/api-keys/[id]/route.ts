import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyCsrfToken } from '@/lib/csrf';
import { getSessionUser } from '@/lib/api/request-user';
import { readAuthJsSessionTokenClaims } from '@/lib/auth/session-token';
import { createServerClient } from '@/lib/supabase';
import { recordAudit } from '@/lib/api-keys';
import { logServerError } from '@/lib/server/logger';
import type { RevokeApiKeyResult } from '@/app/(dashboard)/dashboard/account/api-keys/constants';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: RevokeApiKeyResult, status = 200) {
  return NextResponse.json(body, { status });
}

async function getAllowedOwnerIds() {
  const user = await getSessionUser();
  if (!user?.id) {
    return null;
  }

  const claims = await readAuthJsSessionTokenClaims().catch(() => null);
  const ownerIds = new Set<string>();
  for (const value of [user.id, claims?.id, claims?.sub]) {
    const trimmed = value?.trim();
    if (trimmed) {
      ownerIds.add(trimmed);
    }
  }

  return {
    auditUserId: user.id,
    ownerIds: Array.from(ownerIds),
  };
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = verifyCsrfToken(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return json({ ok: false, code: 'not_found' }, 404);
  }

  const identity = await getAllowedOwnerIds();
  if (!identity) {
    return json({ ok: false, code: 'unauthorized' }, 401);
  }

  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: now, is_active: false })
    .eq('id', id)
    .in('user_id', identity.ownerIds)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    logServerError('Track 2 API key revoke failed', error);
    return json({ ok: false, code: 'internal_error' }, 500);
  }

  if (!data?.id) {
    return json({ ok: false, code: 'not_found' }, 404);
  }

  try {
    await recordAudit({
      apiKeyId: data.id,
      userId: identity.auditUserId,
      action: 'revoked',
      metadata: {},
      supabase,
    });
  } catch (error) {
    logServerError('Track 2 API key revoke audit failed', error);
  }

  revalidatePath('/dashboard/account/api-keys');
  revalidatePath('/dashboard/account/api-keys/audit');

  return json({ ok: true, id: data.id });
}
