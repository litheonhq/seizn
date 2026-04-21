import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createReplayBundle } from '@/lib/replay-bundler';
import { resolveReplayOrganizationId } from '@/lib/replay/snapshot';
import { logServerError } from '@/lib/server/logger';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { traceId } = await params;
    const organizationId = await resolveReplayOrganizationId(session.user.id, null);
    if (!organizationId) {
      return NextResponse.json({ error: 'Replay organization not found' }, { status: 404 });
    }

    const bundle = await createReplayBundle({
      traceId,
      organizationId,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, bundle });
  } catch (error) {
    logServerError('Replay bundle creation failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create replay bundle' },
      { status: 500 }
    );
  }
}
