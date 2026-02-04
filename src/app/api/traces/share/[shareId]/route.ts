import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { NotFoundErrors, ServerErrors } from '@/lib/api-error';
import { revokeShareLink, getSharedTrace, isShareExpired } from '@/lib/share-token';

interface RouteParams {
  params: Promise<{ shareId: string }>;
}

/**
 * GET /api/traces/share/[shareId] - Get share link details
 * Returns details about a specific share link (for owner only)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { shareId } = await params;

    if (!shareId || shareId.length < 6) {
      return NotFoundErrors.resource('share link');
    }

    const sharedTrace = await getSharedTrace(shareId);

    if (!sharedTrace) {
      return NotFoundErrors.resource('share link');
    }

    // Only owner can view details
    if (sharedTrace.user_id !== userId) {
      return NotFoundErrors.resource('share link');
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.seizn.com';
    const expired = isShareExpired(sharedTrace);

    return NextResponse.json({
      success: true,
      share: {
        share_id: sharedTrace.share_id,
        share_url: `${baseUrl}/t/${sharedTrace.share_id}`,
        trace_id: sharedTrace.trace_id,
        expires_at: sharedTrace.expires_at,
        expired,
        view_count: sharedTrace.view_count,
        created_at: sharedTrace.created_at,
        redaction: sharedTrace.redaction_profile,
      },
    });
  } catch (error) {
    console.error('Get share link error:', error);
    return ServerErrors.internal('get_share_link');
  }
}

/**
 * DELETE /api/traces/share/[shareId] - Revoke a share link
 * Only the owner can revoke their share links
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { shareId } = await params;

    if (!shareId || shareId.length < 6) {
      return NotFoundErrors.resource('share link');
    }

    const revoked = await revokeShareLink({ shareId, userId });

    if (!revoked) {
      return NotFoundErrors.resource('share link');
    }

    return NextResponse.json({
      success: true,
      message: 'Share link revoked successfully',
      share_id: shareId,
    });
  } catch (error) {
    console.error('Revoke share link error:', error);
    return ServerErrors.internal('revoke_share_link');
  }
}
