import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  listBeliefsForDashboard,
  recordBelief,
  resolveBeliefOrganizationId,
  type BeliefSourceType,
} from '@/lib/memory/belief';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };
const SOURCE_TYPES = new Set<BeliefSourceType>(['direct', 'told', 'inferred', 'rumor']);

function parseSourceType(value: unknown): BeliefSourceType | null {
  return typeof value === 'string' && SOURCE_TYPES.has(value as BeliefSourceType)
    ? (value as BeliefSourceType)
    : null;
}

async function resolveApiAuth(request: NextRequest, startTime: number) {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) {
    return { error: authErrorResponse(authResult.authError) };
  }

  const supabase = createServerClient();
  const organizationId = await resolveBeliefOrganizationId(supabase, {
    userId: authResult.userId,
    keyId: authResult.keyId,
  });

  if (!organizationId) {
    await logRequest(
      {
        userId: authResult.userId,
        keyId: authResult.keyId,
        endpoint: '/api/v1/beliefs',
        method: request.method,
        startTime,
      },
      404
    );
    return {
      error: NextResponse.json(
        {
          success: false,
          error: { code: 'organization_not_found', message: 'No organization is associated with this API key.' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 404 }
      ),
    };
  }

  return { authResult, supabase, organizationId };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const resolved = await resolveApiAuth(request, startTime);
  if ('error' in resolved) return resolved.error;

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return ValidationErrors.invalidField('limit', 'Must be a number between 1 and 100');
  }

  try {
    const beliefs = await listBeliefsForDashboard(
      resolved.organizationId,
      { holderEntityId: searchParams.get('holder_entity_id') || undefined, limit },
      resolved.supabase
    );

    await logRequest(
      {
        userId: resolved.authResult.userId,
        keyId: resolved.authResult.keyId,
        endpoint: '/api/v1/beliefs',
        method: 'GET',
        startTime,
      },
      200
    );

    return NextResponse.json({
      success: true,
      data: { beliefs },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    logServerError('[v1/beliefs] GET error', error);
    return ServerErrors.internal('list_beliefs');
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const resolved = await resolveApiAuth(request, startTime);
  if ('error' in resolved) return resolved.error;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return ValidationErrors.invalidField('body', 'JSON body is required');

    const holderEntityId = typeof body.holder_entity_id === 'string' ? body.holder_entity_id.trim() : '';
    const aboutFactId = typeof body.about_fact_id === 'string' ? body.about_fact_id.trim() : '';
    const sourceType = parseSourceType(body.source_type);
    const confidence = body.confidence == null ? 1 : Number(body.confidence);
    const observedAt =
      typeof body.observed_at === 'string' && body.observed_at
        ? new Date(body.observed_at)
        : new Date();

    if (!holderEntityId) return ValidationErrors.missingField('holder_entity_id');
    if (!aboutFactId) return ValidationErrors.missingField('about_fact_id');
    if (!sourceType) return ValidationErrors.invalidField('source_type', 'Must be direct, told, inferred, or rumor');
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return ValidationErrors.invalidField('confidence', 'Must be a number between 0 and 1');
    }
    if (Number.isNaN(observedAt.getTime())) {
      return ValidationErrors.invalidField('observed_at', 'Must be an ISO timestamp');
    }

    const result = await recordBelief(
      {
        organizationId: resolved.organizationId,
        holderEntityId,
        aboutFactId,
        observedAt,
        sourceType,
        witnessEventId: typeof body.witness_event_id === 'string' ? body.witness_event_id : undefined,
        confidence,
      },
      resolved.supabase
    );

    await logRequest(
      {
        userId: resolved.authResult.userId,
        keyId: resolved.authResult.keyId,
        endpoint: '/api/v1/beliefs',
        method: 'POST',
        startTime,
      },
      200
    );

    return NextResponse.json({
      success: true,
      data: { belief: result },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    logServerError('[v1/beliefs] POST error', error);
    return ServerErrors.internal('record_belief');
  }
}
