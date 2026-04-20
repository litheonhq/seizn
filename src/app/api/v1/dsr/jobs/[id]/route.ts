import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logRequest } from '@/lib/api-auth';
import { requireComplianceApiActor, withComplianceHeaders } from '@/lib/compliance/api-auth';
import { getDsrJob, verifyArtifactDownload } from '@/lib/compliance/dsr';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const actor = await requireComplianceApiActor(request, startTime);
  if ('error' in actor) return actor.error;

  try {
    const { id } = await params;
    const job = await getDsrJob(createServerClient(), {
      organizationId: actor.organizationId,
      jobId: id,
    });

    if (!job) {
      await logRequest(
        { userId: actor.userId, keyId: actor.keyId, endpoint: `/api/v1/dsr/jobs/${id}`, method: 'GET', startTime },
        404
      );
      return NextResponse.json(
        {
          success: false,
          error: { code: 'not_found', message: 'DSR job not found.' },
          meta: META,
        },
        { status: 404 }
      );
    }

    const { searchParams, pathname } = request.nextUrl;
    if (searchParams.get('download') === 'artifact') {
      const allowed = verifyArtifactDownload({
        path: pathname,
        expires: searchParams.get('expires'),
        signature: searchParams.get('sig'),
      });
      if (!allowed) {
        await logRequest(
          { userId: actor.userId, keyId: actor.keyId, endpoint: `/api/v1/dsr/jobs/${id}`, method: 'GET', startTime },
          403
        );
        return NextResponse.json(
          {
            success: false,
            error: { code: 'artifact_signature_invalid', message: 'Artifact URL is expired or invalid.' },
            meta: META,
          },
          { status: 403 }
        );
      }

      await logRequest(
        { userId: actor.userId, keyId: actor.keyId, endpoint: `/api/v1/dsr/jobs/${id}`, method: 'GET', startTime },
        200
      );
      return withComplianceHeaders(
        NextResponse.json(job.artifact ?? job.certificate ?? {}),
        actor.rateLimitHeaders
      );
    }

    await logRequest(
      { userId: actor.userId, keyId: actor.keyId, endpoint: `/api/v1/dsr/jobs/${id}`, method: 'GET', startTime },
      200
    );
    return withComplianceHeaders(
      NextResponse.json({
        success: true,
        data: {
          job: {
            ...job,
            artifact: undefined,
          },
        },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      actor.rateLimitHeaders
    );
  } catch (error) {
    logServerError('[v1/dsr/jobs] error', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'dsr/job_failed', message: 'Unable to load DSR job.' },
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status: 500 }
    );
  }
}
