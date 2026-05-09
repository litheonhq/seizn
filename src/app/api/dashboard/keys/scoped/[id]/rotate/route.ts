import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { rotateScopedApiKey } from '@/lib/scoped-api-keys';
import { verifyCsrfToken } from '@/lib/csrf';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/dashboard/keys/scoped/[id]/rotate - Rotate a scoped API key
 *
 * Creates a new key with the same settings and revokes the old key.
 * Returns the new full key (shown only once).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const csrfErr = verifyCsrfToken(request);
    if (csrfErr) return csrfErr;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const result = await rotateScopedApiKey(session.user.id, id);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logServerError('Rotate scoped key error', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('not found') ? 404 : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
