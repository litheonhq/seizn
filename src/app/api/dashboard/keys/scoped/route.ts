import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  createScopedApiKey,
  listScopedApiKeys,
  CreateScopedApiKeyRequest,
  ScopeLevel,
  ActionType,
} from '@/lib/scoped-api-keys';
import { verifyCsrfToken } from '@/lib/csrf';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/dashboard/keys/scoped - List user's scoped API keys
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId') || undefined;
    const scopeLevel = searchParams.get('scopeLevel') as ScopeLevel | undefined;
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const keys = await listScopedApiKeys(session.user.id, {
      organizationId,
      scopeLevel,
      includeInactive,
      offset,
      limit,
    });

    return NextResponse.json({
      success: true,
      keys,
    });
  } catch (error) {
    logServerError('List scoped keys error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/keys/scoped - Create a new scoped API key
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!body.scope || !body.scope.level || !body.scope.actions?.length) {
      return NextResponse.json(
        { error: 'Scope configuration with level and actions is required' },
        { status: 400 }
      );
    }

    // Validate scope level
    if (!['user', 'organization', 'project'].includes(body.scope.level)) {
      return NextResponse.json(
        { error: 'Invalid scope level. Must be user, organization, or project' },
        { status: 400 }
      );
    }

    // Validate actions
    const validActions = ['read', 'write', 'admin'];
    for (const action of body.scope.actions) {
      if (!validActions.includes(action)) {
        return NextResponse.json(
          { error: `Invalid action: ${action}. Must be read, write, or admin` },
          { status: 400 }
        );
      }
    }

    const createRequest: CreateScopedApiKeyRequest = {
      name: body.name,
      description: body.description,
      scope: {
        level: body.scope.level as ScopeLevel,
        organizationId: body.scope.organizationId,
        projectIds: body.scope.projectIds,
        actions: body.scope.actions as ActionType[],
        customPermissions: body.scope.customPermissions,
        deniedPermissions: body.scope.deniedPermissions,
      },
      ipRestriction: body.ipRestriction,
      rateLimitOverride: body.rateLimitOverride,
      expiresInDays: body.expiresInDays,
    };

    const result = await createScopedApiKey(session.user.id, createRequest);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logServerError('Create scoped key error', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('limit reached') ? 403 : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
