import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import { getDsrJobStatus } from '@/lib/compliance/dsr-worker';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

async function resolveOrganizationId(): Promise<
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
        { success: false, error: { code: 'organization_required', message: 'No organization is available for this DSR job' } },
        { status: 403 }
      ),
    };
  }
  return { userId: session.user.id, organizationId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const context = await resolveOrganizationId();
    if ('error' in context) return context.error;
    const { jobId } = await params;
    const job = await getDsrJobStatus(createServerClient(), context.organizationId, jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: { code: 'not_found', message: 'DSR job not found' } },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        jobId: job.jobId,
        jobType: job.jobType,
        subjectId: job.subjectId,
        status: job.status,
        downloadUrl: job.downloadUrl,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    logServerError('[api/dsr/jobs/status] GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'dsr_job_status_failed', message: 'Failed to load DSR job status' } },
      { status: 500 }
    );
  }
}
