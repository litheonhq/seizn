import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logRequest } from '@/lib/api-auth';
import { safeJsonParse } from '@/lib/safe-json';
import { requireComplianceApiActor, withComplianceHeaders } from '@/lib/compliance/api-auth';
import { createDsrExport } from '@/lib/compliance/dsr';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };

function clientError(message: string, status = 400): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code: 'invalid_field', message },
      meta: META,
    },
    { status }
  );
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const actor = await requireComplianceApiActor(request, startTime);
  if ('error' in actor) return actor.error;

  try {
    const body = await safeJsonParse<{ subject_id?: string }>(request);
    if (!body.subject_id || typeof body.subject_id !== 'string') {
      await logRequest(
        { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/dsr/export', method: 'POST', startTime },
        400
      );
      return clientError('subject_id is required');
    }

    const result = await createDsrExport(createServerClient(), {
      actor,
      subjectId: body.subject_id,
    });

    await logRequest(
      { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/dsr/export', method: 'POST', startTime },
      200
    );

    return withComplianceHeaders(
      NextResponse.json({
        success: true,
        data: {
          job_id: result.jobId,
          status: result.status,
          artifact_url: result.artifactUrl,
          webhook_url: result.webhookUrl,
          counts: result.archive.counts,
        },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      actor.rateLimitHeaders
    );
  } catch (error) {
    logServerError('[v1/dsr/export] error', error);
    await logRequest(
      { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/dsr/export', method: 'POST', startTime },
      500
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: 'dsr/export_failed', message: 'Unable to create DSR export.' },
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status: 500 }
    );
  }
}
