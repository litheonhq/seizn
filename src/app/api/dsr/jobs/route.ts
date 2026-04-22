import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import { enqueueDsrJob, listDsrJobs, type DsrSessionActor } from '@/lib/compliance/dsr-worker';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

async function requireSessionActor(): Promise<DsrSessionActor | { error: NextResponse }> {
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
        { success: false, error: { code: 'organization_required', message: 'No organization is available for DSR jobs' } },
        { status: 403 }
      ),
    };
  }

  return {
    userId: session.user.id,
    organizationId,
  };
}

export async function GET() {
  try {
    const actor = await requireSessionActor();
    if ('error' in actor) return actor.error;

    const jobs = await listDsrJobs(createServerClient(), actor.organizationId);
    return NextResponse.json({ success: true, data: { jobs } });
  } catch (error) {
    logServerError('[api/dsr/jobs] GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'dsr_jobs_unavailable', message: 'Failed to list DSR jobs' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireSessionActor();
    if ('error' in actor) return actor.error;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const jobType = body.jobType;
    const subjectId = body.subjectId;
    if (jobType !== 'export' && jobType !== 'delete') {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_job_type', message: 'jobType must be export or delete' } },
        { status: 400 }
      );
    }
    if (typeof subjectId !== 'string' || !subjectId.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_subject', message: 'subjectId is required' } },
        { status: 400 }
      );
    }

    const job = await enqueueDsrJob(createServerClient(), {
      actor,
      jobType,
      subjectId,
      reason: typeof body.reason === 'string' ? body.reason : null,
    });

    return NextResponse.json(
      { success: true, data: { jobId: job.jobId, status: job.status } },
      { status: 201 }
    );
  } catch (error) {
    logServerError('[api/dsr/jobs] POST failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'dsr_job_create_failed', message: 'Failed to enqueue DSR job' } },
      { status: 500 }
    );
  }
}
