/**
 * Memory Profile API - Profile cards for instant context loading
 *
 * GET /api/memories/profile - Get profile card
 * POST /api/memories/profile - Update/regenerate profile card
 * DELETE /api/memories/profile - Delete profile
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import {
  getProfile,
  updateProfile,
  deleteProfile,
  getProfileContext,
  profileNeedsUpdate,
} from '@/lib/memory/profile';
import { getClusterStats } from '@/lib/memory/compaction';

// GET /api/memories/profile - Get profile card
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const namespace = searchParams.get('namespace') || 'default';
    const format = searchParams.get('format') || 'json'; // json or context

    // Get profile
    const profile = await getProfile(userId, namespace);

    // Check if profile needs update
    const needsUpdate = await profileNeedsUpdate(userId, namespace);

    // Get cluster stats
    const clusterStats = await getClusterStats(userId, namespace);

    await logRequest(
      { userId, keyId, endpoint: '/api/memories/profile', method: 'GET', startTime },
      200
    );

    if (format === 'context') {
      // Return formatted context for injection
      const context = await getProfileContext(userId, namespace);
      return NextResponse.json({
        success: true,
        context,
        needsUpdate,
      });
    }

    return NextResponse.json({
      success: true,
      profile: profile || null,
      needsUpdate,
      stats: {
        ...clusterStats,
        memoryCount: profile?.memoryCount || 0,
        slotCount: profile?.slotCount || 0,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return ServerErrors.internal('get_profile');
  }
}

// POST /api/memories/profile - Update/regenerate profile card
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const {
      namespace = 'default',
      force = false,
      maxMemories = 100,
      maxLength = 2000,
      model = 'haiku',
    } = body;

    // Check if update is needed (unless forced)
    if (!force) {
      const needsUpdate = await profileNeedsUpdate(userId, namespace);
      if (!needsUpdate) {
        const existingProfile = await getProfile(userId, namespace);
        if (existingProfile) {
          await logRequest(
            { userId, keyId, endpoint: '/api/memories/profile', method: 'POST', startTime },
            200
          );
          return NextResponse.json({
            success: true,
            message: 'Profile is up to date',
            profile: existingProfile,
            updated: false,
          });
        }
      }
    }

    // Update profile
    const profile = await updateProfile(userId, namespace, {
      maxMemories,
      maxLength,
      model,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Failed to generate profile (no memories?)' },
        { status: 400 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/memories/profile', method: 'POST', startTime },
      200,
      { output: profile.profileCard.length }
    );

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      profile,
      updated: true,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return ServerErrors.internal('update_profile');
  }
}

// DELETE /api/memories/profile - Delete profile
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const namespace = searchParams.get('namespace') || 'default';

    const success = await deleteProfile(userId, namespace);

    await logRequest(
      { userId, keyId, endpoint: '/api/memories/profile', method: 'DELETE', startTime },
      success ? 200 : 404
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Profile not found or delete failed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Profile deleted',
    });
  } catch (error) {
    console.error('Delete profile error:', error);
    return ServerErrors.internal('delete_profile');
  }
}
