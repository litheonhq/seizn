import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { normalizeAgeBracket } from '@/lib/compliance/age-gate';
import { recordConsent } from '@/lib/compliance/consent';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import { verifyCsrfToken } from '@/lib/csrf';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

async function requireSessionOrg(): Promise<
  | { userId: string; organizationId: string }
  | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      ),
    };
  }
  const supabase = createServerClient();
  const organizationId =
    session.user.organizationId ||
    await resolveComplianceOrganizationId(supabase, { userId: session.user.id });
  if (!organizationId) {
    return {
      error: NextResponse.json(
        { success: false, error: { code: 'organization_required', message: 'No organization is available for consent records' } },
        { status: 403 }
      ),
    };
  }
  return { userId: session.user.id, organizationId };
}

export async function POST(request: NextRequest) {
  try {
    const csrfErr = verifyCsrfToken(request);
    if (csrfErr) return csrfErr;

    const context = await requireSessionOrg();
    if ('error' in context) return context.error;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : '';
    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
    if (!subjectId.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_subject', message: 'subjectId is required' } },
        { status: 400 }
      );
    }
    if (scopes.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_scope', message: 'At least one scope is required' } },
        { status: 400 }
      );
    }

    const consent = await recordConsent(createServerClient(), {
      organizationId: context.organizationId,
      subjectId,
      ageBracket: normalizeAgeBracket(body.ageBracket),
      scopes,
      version: typeof body.version === 'string' ? body.version : '2026-04-01',
      parentProof: typeof body.parentProof === 'string' ? body.parentProof : null,
      expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
    });

    return NextResponse.json({ success: true, data: { consent } }, { status: 201 });
  } catch (error) {
    logServerError('[api/consent] POST failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'consent_record_failed', message: 'Failed to record consent' } },
      { status: 500 }
    );
  }
}
