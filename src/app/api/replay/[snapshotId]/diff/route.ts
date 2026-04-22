import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveReplayOrganizationId } from '@/lib/replay/snapshot';
import {
  loadLatestReplayDiff,
  loadReplaySnapshotRecord,
} from '@/lib/replay/runner';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ snapshotId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('unauthorized', 'Authentication required.', 401);
    }

    const { snapshotId } = await params;
    const organizationId = await resolveReplayOrganizationId(session.user.id, null);
    if (!organizationId) {
      return errorResponse('replay_organization_required', 'Replay organization not found.', 403);
    }

    const snapshot = await loadReplaySnapshotRecord(snapshotId, organizationId);
    if (!snapshot) {
      return errorResponse('not_found', 'Replay snapshot not found.', 404);
    }

    const replayDiff = await loadLatestReplayDiff(snapshotId, organizationId);
    if (!replayDiff) {
      return errorResponse('not_found', 'Replay diff not found.', 404);
    }

    return NextResponse.json({
      success: true,
      data: {
        snapshotId,
        diff: replayDiff.diff,
        replayedAt: replayDiff.replayed_at,
        seedMatch: replayDiff.seed_match,
        outputMatch: replayDiff.output_match,
      },
    });
  } catch (error) {
    logServerError('Replay diff lookup failed', error);
    return errorResponse('replay_diff_failed', 'Failed to load replay diff.', 500);
  }
}

function errorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status }
  );
}
