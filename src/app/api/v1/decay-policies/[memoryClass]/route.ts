import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { resolveDecayOrganizationId, upsertPolicy } from '@/lib/memory/decay';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };

interface RouteParams {
  params: Promise<{ memoryClass: string }>;
}

function optionalNumber(value: unknown, field: string, min: number, max: number): number | null | NextResponse {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return ValidationErrors.invalidField(field, `Must be a number between ${min} and ${max}`);
  }
  return parsed;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) return authErrorResponse(authResult.authError);

  try {
    const { memoryClass } = await params;
    if (!memoryClass || memoryClass.length > 64) {
      return ValidationErrors.invalidField('memoryClass', 'Must be 1-64 characters');
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return ValidationErrors.invalidField('body', 'JSON body is required');

    const halfLifeProvided = Object.prototype.hasOwnProperty.call(body, 'half_life_hours');
    const halfLifeHours =
      body.half_life_hours === null
        ? null
        : optionalNumber(body.half_life_hours, 'half_life_hours', 0.1, 100000);
    const minStrength = optionalNumber(body.min_strength, 'min_strength', 0, 1);
    const reinforceBoost = optionalNumber(body.reinforce_boost, 'reinforce_boost', 0, 1);
    const rerankWeight = optionalNumber(body.rerank_weight, 'rerank_weight', 0, 1);

    for (const maybeResponse of [halfLifeHours, minStrength, reinforceBoost, rerankWeight]) {
      if (maybeResponse instanceof NextResponse) return maybeResponse;
    }

    const supabase = createServerClient();
    const organizationId = await resolveDecayOrganizationId(supabase, {
      userId: authResult.userId,
      keyId: authResult.keyId,
    });
    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'organization_not_found', message: 'No organization is associated with this API key.' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 404 }
      );
    }

    const policyInput = {
      ...(halfLifeProvided ? { halfLifeHours: halfLifeHours as number | null } : {}),
      ...(minStrength !== null ? { minStrength: minStrength as number } : {}),
      ...(reinforceBoost !== null ? { reinforceBoost: reinforceBoost as number } : {}),
      ...(rerankWeight !== null ? { rerankWeight: rerankWeight as number } : {}),
    };

    const policy = await upsertPolicy(
      organizationId,
      memoryClass,
      policyInput,
      supabase
    );

    await logRequest(
      {
        userId: authResult.userId,
        keyId: authResult.keyId,
        endpoint: '/api/v1/decay-policies/[memoryClass]',
        method: 'PUT',
        startTime,
      },
      200
    );

    return NextResponse.json({
      success: true,
      data: { policy },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    logServerError('[v1/decay-policies/:memoryClass] PUT error', error);
    return ServerErrors.internal('upsert_decay_policy');
  }
}
