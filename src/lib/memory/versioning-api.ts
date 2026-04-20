import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

export const VERSIONING_META = { version: 'v1' as const };

export function withVersioningHeaders(
  response: NextResponse,
  headers?: Record<string, string>
): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export async function resolveVersioningAuth(
  request: NextRequest
): Promise<
  | { userId: string; keyId: string | null; rateLimitHeaders?: Record<string, string> }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return {
      userId: authResult.userId,
      keyId: authResult.keyId,
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }

  return { error: authErrorResponse(authResult.authError) };
}

export async function resolveVersioningOrganizationId(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  keyId: string | null
): Promise<string | null> {
  if (keyId) {
    const { data: keyRow } = await supabase
      .from('api_keys')
      .select('organization_id')
      .eq('id', keyId)
      .maybeSingle();
    if (keyRow?.organization_id) return String(keyRow.organization_id);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.organization_id) return String(profile.organization_id);

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return member?.organization_id ? String(member.organization_id) : null;
}

export function asVersioningString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function jsonError(message: string, status: number, startTime: number, code = 'internal_error') {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
      meta: { ...VERSIONING_META, latencyMs: Date.now() - startTime },
    },
    { status }
  );
}
