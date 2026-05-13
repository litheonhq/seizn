import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase';
import { logRequest } from '@/lib/api-auth';
import { requireComplianceApiActor, withComplianceHeaders } from '@/lib/compliance/api-auth';
import { queryAuditLogs } from '@/lib/compliance/dsr';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const actor = await requireComplianceApiActor(request, startTime);
  if ('error' in actor) return actor.error;

  try {
    const { searchParams } = request.nextUrl;
    const result = await queryAuditLogs(createServerClient(), {
      organizationId: actor.organizationId,
      from: parseDateParam(searchParams.get('from')),
      to: parseDateParam(searchParams.get('to')),
      eventType: searchParams.get('event_type') || undefined,
      actor: searchParams.get('actor') || undefined,
      subjectId: searchParams.get('subject_id') || undefined,
      limit: Number.parseInt(searchParams.get('limit') || '50', 10),
      offset: Number.parseInt(searchParams.get('offset') || '0', 10),
    });

    await logRequest(
      { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/audit', method: 'GET', startTime },
      200
    );

    return withComplianceHeaders(
      NextResponse.json({
        success: true,
        data: result,
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      actor.rateLimitHeaders
    );
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag('api_version', 'v1');
      scope.setTag('endpoint', '/api/v1/audit');
      scope.setTag('error_class', 'internal');
      Sentry.captureException(error);
    });
    logServerError('[v1/audit] query error', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'audit/query_failed', message: 'Unable to query audit logs.' },
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status: 500 }
    );
  }
}
