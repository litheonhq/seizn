/**
 * Structured Profile API (PR-021)
 *
 * GET  /api/v1/profile - Get current structured profile (+ version history)
 * PUT  /api/v1/profile - Update profile fields (creates new version)
 *
 * Supports dual auth: API key (Bearer) first, session fallback.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createProfileService } from '@/lib/spring/memory-v4/profile-service';

/**
 * Resolve userId from API key auth or session auth.
 * Returns userId string or a NextResponse error.
 */
async function resolveAuth(
  request: NextRequest
): Promise<
  | { userId: string; keyId: string | null }
  | { error: NextResponse }
> {
  // Try API key auth first
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, keyId: authResult.keyId };
  }

  // Fallback to session auth
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }

  // Neither worked
  return { error: authErrorResponse(authResult.authError) };
}

// GET /api/v1/profile
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) {
      return result.error;
    }

    const { userId, keyId } = result;
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('history') === 'true';
    const historyLimit = parseInt(searchParams.get('history_limit') || '10', 10);

    const supabase = createServerClient();
    const profileService = createProfileService(supabase);

    const profile = await profileService.getProfile(userId);

    let history = undefined;
    if (includeHistory) {
      history = await profileService.getVersionHistory(userId, historyLimit);
    }

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/profile', method: 'GET', startTime },
        200
      );
    }

    return NextResponse.json({
      success: true,
      profile: profile ?? null,
      ...(history !== undefined && { history }),
    });
  } catch (error) {
    console.error('[Profile API] GET error:', error);
    return ServerErrors.internal('get_structured_profile');
  }
}

// PUT /api/v1/profile
export async function PUT(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) {
      return result.error;
    }

    const { userId, keyId } = result;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Request body must be valid JSON');
    }

    // Validate that at least one updatable field is present
    const allowedFields = [
      'aboutMe',
      'preferences',
      'constraints',
      'tools',
      'workstyle',
      'customFields',
    ];
    const providedFields = Object.keys(body).filter((k) => allowedFields.includes(k));

    if (providedFields.length === 0) {
      return ValidationErrors.invalidBody(
        `No updatable fields provided. Allowed fields: ${allowedFields.join(', ')}`
      );
    }

    // Type-check individual fields
    if (body.aboutMe !== undefined && typeof body.aboutMe !== 'string') {
      return ValidationErrors.invalidField('aboutMe', 'must be a string');
    }
    if (body.workstyle !== undefined && typeof body.workstyle !== 'string') {
      return ValidationErrors.invalidField('workstyle', 'must be a string');
    }
    if (body.preferences !== undefined && (typeof body.preferences !== 'object' || body.preferences === null || Array.isArray(body.preferences))) {
      return ValidationErrors.invalidField('preferences', 'must be an object');
    }
    if (body.constraints !== undefined && !Array.isArray(body.constraints)) {
      return ValidationErrors.invalidField('constraints', 'must be an array of strings');
    }
    if (body.tools !== undefined && !Array.isArray(body.tools)) {
      return ValidationErrors.invalidField('tools', 'must be an array of strings');
    }
    if (body.customFields !== undefined && (typeof body.customFields !== 'object' || body.customFields === null || Array.isArray(body.customFields))) {
      return ValidationErrors.invalidField('customFields', 'must be an object');
    }

    const supabase = createServerClient();
    const profileService = createProfileService(supabase);

    const profile = await profileService.updateProfile(userId, {
      aboutMe: body.aboutMe as string | undefined,
      preferences: body.preferences as Record<string, unknown> | undefined,
      constraints: body.constraints as string[] | undefined,
      tools: body.tools as string[] | undefined,
      workstyle: body.workstyle as string | undefined,
      customFields: body.customFields as Record<string, unknown> | undefined,
    });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/profile', method: 'PUT', startTime },
        200
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Profile updated',
      profile,
    });
  } catch (error) {
    console.error('[Profile API] PUT error:', error);
    return ServerErrors.internal('update_structured_profile');
  }
}
