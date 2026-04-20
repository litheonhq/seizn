import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { logRequest } from '@/lib/api-auth';
import { requireComplianceApiActor, withComplianceHeaders } from '@/lib/compliance/api-auth';
import { exportAuditLogs } from '@/lib/compliance/dsr';
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
    const format = searchParams.get('format') === 'csv' ? 'csv' : 'jsonl';
    const result = await exportAuditLogs(createServerClient(), {
      organizationId: actor.organizationId,
      from: parseDateParam(searchParams.get('from')),
      to: parseDateParam(searchParams.get('to')),
      eventType: searchParams.get('event_type') || undefined,
      actor: actor.userId,
      subjectId: searchParams.get('subject_id') || undefined,
      format,
    });

    await logRequest(
      { userId: actor.userId, keyId: actor.keyId, endpoint: '/api/v1/audit/export', method: 'GET', startTime },
      200
    );

    return withComplianceHeaders(
      NextResponse.json({
        success: true,
        data: {
          artifact_url: result.artifactUrl,
          format: result.format,
          count: result.count,
          content: result.content,
        },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      actor.rateLimitHeaders
    );
  } catch (error) {
    logServerError('[v1/audit/export] error', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'audit/export_failed', message: 'Unable to export audit logs.' },
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status: 500 }
    );
  }
}
