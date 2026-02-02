import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getScopedApiKey,
  updateScopedApiKey,
  revokeScopedApiKey,
  deleteScopedApiKey,
} from '@/lib/scoped-api-keys';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/dashboard/keys/scoped/[id] - Get a specific scoped API key
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const key = await getScopedApiKey(session.user.id, id);

    if (!key) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      key,
    });
  } catch (error) {
    console.error('Get scoped key error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/dashboard/keys/scoped/[id] - Update a scoped API key
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    // Validate at least one field is provided
    if (!body.name && !body.description && !body.scope &&
        body.ipRestriction === undefined && body.rateLimitOverride === undefined) {
      return NextResponse.json(
        { error: 'At least one field to update is required' },
        { status: 400 }
      );
    }

    const updatedKey = await updateScopedApiKey(session.user.id, id, {
      name: body.name,
      description: body.description,
      scope: body.scope,
      ipRestriction: body.ipRestriction,
      rateLimitOverride: body.rateLimitOverride,
    });

    return NextResponse.json({
      success: true,
      key: updatedKey,
    });
  } catch (error) {
    console.error('Update scoped key error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('not found') ? 404 : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

/**
 * DELETE /api/dashboard/keys/scoped/[id] - Revoke or delete a scoped API key
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    if (permanent) {
      await deleteScopedApiKey(session.user.id, id);
      return NextResponse.json({
        success: true,
        message: 'API key permanently deleted',
      });
    } else {
      await revokeScopedApiKey(session.user.id, id);
      return NextResponse.json({
        success: true,
        message: 'API key revoked',
      });
    }
  } catch (error) {
    console.error('Delete/revoke scoped key error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
