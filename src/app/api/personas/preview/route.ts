import { NextRequest, NextResponse } from 'next/server';
import {
  loadPersonaPreviewRows,
  resolvePersonaDataSource,
  toPersonaPreview,
  type PersonaSeedCriteria,
} from '@/lib/personas/api';
import {
  parsePersonaCount,
  resolvePersonaRouteAuth,
  validatePersonaBatchLimit,
} from '@/lib/personas/route-auth';
import { logServerError } from '@/lib/server/logger';

function parseCriteria(params: URLSearchParams): PersonaSeedCriteria {
  const ageMin = Number.parseInt(params.get('ageMin') || '', 10);
  const ageMax = Number.parseInt(params.get('ageMax') || '', 10);
  const hasAgeRange = Number.isFinite(ageMin) && Number.isFinite(ageMax);

  return {
    region: params.get('region') || undefined,
    occupation: params.get('occupation') || undefined,
    lifeStage: params.get('lifeStage') || undefined,
    ageRange: hasAgeRange ? [Math.min(ageMin, ageMax), Math.max(ageMin, ageMax)] : undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolvePersonaRouteAuth(request);
    if ('response' in resolved) return resolved.response;

    const count = parsePersonaCount(request.nextUrl.searchParams.get('count'));
    const limitError = validatePersonaBatchLimit(count, resolved.auth);
    if (limitError) return limitError;

    const criteria = parseCriteria(request.nextUrl.searchParams);
    const personas = await loadPersonaPreviewRows({
      plan: resolved.auth.plan,
      count,
      criteria,
    });

    return NextResponse.json({
      success: true,
      personas: personas.map(toPersonaPreview),
      count: personas.length,
      limit: resolved.auth.batchLimit,
      source: resolvePersonaDataSource(resolved.auth.plan),
    });
  } catch (error) {
    logServerError('Persona preview failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'preview_failed', message: 'Failed to load persona previews.' } },
      { status: 500 },
    );
  }
}
