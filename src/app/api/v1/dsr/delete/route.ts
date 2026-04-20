import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logRequest } from '@/lib/api-auth';
import { safeJsonParse } from '@/lib/safe-json';
import { requireComplianceApiActor, withComplianceHeaders } from '@/lib/compliance/api-auth';
import { createDsrDeletion } from '@/lib/compliance/dsr';
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
    const body = await safeJsonParse<{ subject_id?: string; reason?: string }>(request);
    if (!body.subject_id || typeof body.subject_id !== 'string') {
      await logRequest(
        { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/dsr/delete', method: 'POST', startTime },
        400
      );
      return clientError('subject_id is required');
    }
    if (!body.reason || typeof body.reason !== 'string') {
      await logRequest(
        { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/dsr/delete', method: 'POST', startTime },
        400
      );
      return clientError('reason is required');
    }

    const result = await createDsrDeletion(createServerClient(), {
      actor,
      subjectId: body.subject_id,
      reason: body.reason,
    });

    await logRequest(
      { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/dsr/delete', method: 'POST', startTime },
      200
    );

    return withComplianceHeaders(
      NextResponse.json({
        success: true,
        data: {
          job_id: result.jobId,
          status: result.status,
          certificate: result.certificate,
        },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      actor.rateLimitHeaders
    );
  } catch (error) {
    logServerError('[v1/dsr/delete] error', error);
    await logRequest(
      { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/dsr/delete', method: 'POST', startTime },
      500
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: 'dsr/delete_failed', message: 'Unable to complete DSR deletion.' },
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status: 500 }
    );
  }
}
