/**
 * Profile Derivation API (PR-021)
 *
 * POST /api/v1/profile/derive - Trigger LLM derivation of structured profile from memories
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
import { ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createProfileService } from '@/lib/spring/memory-v4/profile-service';

/**
 * Resolve userId from API key auth or session auth.
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

  return { error: authErrorResponse(authResult.authError) };
}

// POST /api/v1/profile/derive
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) {
      return result.error;
    }

    const { userId, keyId } = result;

    const supabase = createServerClient();
    const profileService = createProfileService(supabase);

    const profile = await profileService.deriveFromMemories(userId);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/profile/derive', method: 'POST', startTime },
        200
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Profile derived from memories',
      profile,
    });
  } catch (error) {
    console.error('[Profile API] Derive error:', error);

    if (error instanceof Error && error.message.includes('parse')) {
      return NextResponse.json(
        {
          error: {
            error_code: 'AI_MODEL_ERROR',
            message: 'Failed to derive structured profile from memories. The LLM response could not be parsed.',
            hint: 'Try again; results may vary between attempts.',
          },
        },
        { status: 500 }
      );
    }

    return ServerErrors.internal('derive_structured_profile');
  }
}
