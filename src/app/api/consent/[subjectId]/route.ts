import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getActiveConsent } from '@/lib/compliance/consent';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

async function requireSessionOrg(): Promise<
  | { organizationId: string }
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
  return { organizationId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const context = await requireSessionOrg();
    if ('error' in context) return context.error;

    const { subjectId } = await params;
    const consent = await getActiveConsent(createServerClient(), {
      organizationId: context.organizationId,
      subjectId,
    });
    if (!consent) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Consent record not found' } },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: { consent } });
  } catch (error) {
    logServerError('[api/consent/[subjectId]] GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'consent_lookup_failed', message: 'Failed to load consent' } },
      { status: 500 }
    );
  }
}
