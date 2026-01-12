import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { enqueueDeletionJob, runDeletionJob } from '@/lib/winter/forget';

// POST /api/winter/forget
// Body:
// {
//   "reason"?: "string",
//   "run_now"?: boolean
// }
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    const { jobId } = await enqueueDeletionJob({
      userId,
      reason: body?.reason ?? 'user_request',
      metadata: { requested_via: 'api' },
    });

    // Dev option only: execute synchronously.
    if (body?.run_now === true) {
      await runDeletionJob({ jobId });
    }

    return NextResponse.json({ success: true, job_id: jobId }, { status: 200 });
  } catch (err) {
    console.error('Winter forget error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
