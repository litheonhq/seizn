import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOrganizationApiKeys } from '@/lib/scoped-api-keys';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/dashboard/keys/scoped/organization/[orgId] - List API keys for an organization
 *
 * Only accessible by organization admins and owners.
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

    const { orgId } = await params;

    const keys = await getOrganizationApiKeys(session.user.id, orgId);

    return NextResponse.json({
      success: true,
      keys,
    });
  } catch (error) {
    console.error('List organization keys error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('Only organization admins') ? 403 : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
