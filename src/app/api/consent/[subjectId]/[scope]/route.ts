import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { revokeConsentScope } from '@/lib/compliance/consent';
import { enqueueDsrJob } from '@/lib/compliance/dsr-worker';
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ subjectId: string; scope: string }> }
) {
  try {
    const csrfErr = verifyCsrfToken(request);
    if (csrfErr) return csrfErr;

    const context = await requireSessionOrg();
    if ('error' in context) return context.error;

    const { subjectId, scope } = await params;
    const revoked = await revokeConsentScope(createServerClient(), {
      organizationId: context.organizationId,
      subjectId,
      scope,
    });
    if (!revoked.revoked) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'Active consent scope not found' } },
        { status: 404 }
      );
    }

    const job = await enqueueDsrJob(createServerClient(), {
      actor: { userId: context.userId, organizationId: context.organizationId },
      jobType: 'delete',
      subjectId,
      reason: `Consent scope revoked: ${scope}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        revokedAt: revoked.revokedAt,
        deletionJobId: job.jobId,
      },
    });
  } catch (error) {
    logServerError('[api/consent/[subjectId]/[scope]] DELETE failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'consent_revoke_failed', message: 'Failed to revoke consent' } },
      { status: 500 }
    );
  }
}
