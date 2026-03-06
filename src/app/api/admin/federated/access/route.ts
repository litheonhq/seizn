import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { getAuditContext } from '@/lib/audit';
import {
  checkSourcePermission,
  grantSourceAccess,
  revokeSourceAccess,
  logFederatedOperation,
  type FederatedRole,
} from '@/lib/summer/admin';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/admin/federated/access
 *
 * List access grants for a federated source.
 *
 * Query params:
 * - source_id: string (required)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);
    const sourceId = url.searchParams.get('source_id');

    if (!sourceId) {
      return NextResponse.json(
        { error: 'source_id is required' },
        { status: 400 }
      );
    }

    // Check permission (need viewer to see access list)
    const hasAccess = await checkSourcePermission(userId, sourceId, 'viewer');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied to this source' },
        { status: 403 }
      );
    }

    const supabase = createServerClient();

    const { data: grants, error } = await supabase
      .from('summer_federated_source_access')
      .select(`
        id,
        user_id,
        organization_id,
        role,
        granted_by,
        created_at,
        updated_at
      `)
      .eq('source_id', sourceId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      source_id: sourceId,
      grants: (grants ?? []).map((g) => ({
        id: g.id,
        user_id: g.user_id,
        organization_id: g.organization_id,
        role: g.role,
        granted_by: g.granted_by,
        created_at: g.created_at,
        updated_at: g.updated_at,
      })),
    });
  } catch (err) {
    logServerError('List federated source access failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/federated/access
 *
 * Grant access to a federated source.
 *
 * Body:
 * {
 *   "source_id": string,
 *   "user_id"?: string,
 *   "organization_id"?: string,
 *   "role": "owner" | "editor" | "viewer"
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const context = getAuditContext(request);

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    const sourceId = body.source_id;
    const targetUserId = body.user_id;
    const targetOrgId = body.organization_id;
    const role = body.role as FederatedRole;

    if (!sourceId) {
      return NextResponse.json(
        { error: 'source_id is required' },
        { status: 400 }
      );
    }

    if (!targetUserId && !targetOrgId) {
      return NextResponse.json(
        { error: 'Either user_id or organization_id is required' },
        { status: 400 }
      );
    }

    const validRoles: FederatedRole[] = ['owner', 'editor', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'role must be one of: owner, editor, viewer' },
        { status: 400 }
      );
    }

    // Check permission (need owner to grant access)
    const hasAccess = await checkSourcePermission(userId, sourceId, 'owner');
    if (!hasAccess) {
      await logFederatedOperation(
        {
          userId,
          operation: 'access.grant',
          resourceType: 'access',
          resourceId: sourceId,
          details: { target_user: targetUserId, target_org: targetOrgId, role },
          status: 'denied',
          errorMessage: 'Insufficient permissions',
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json(
        { error: 'Only source owners can grant access' },
        { status: 403 }
      );
    }

    const result = await grantSourceAccess({
      sourceId,
      targetUserId,
      targetOrganizationId: targetOrgId,
      role,
      grantedBy: userId,
    });

    if (!result.success) {
      await logFederatedOperation(
        {
          userId,
          operation: 'access.grant',
          resourceType: 'access',
          resourceId: sourceId,
          details: { target_user: targetUserId, target_org: targetOrgId, role },
          status: 'failed',
          errorMessage: result.error,
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Log success
    await logFederatedOperation(
      {
        userId,
        operation: 'access.grant',
        resourceType: 'access',
        resourceId: sourceId,
        details: { target_user: targetUserId, target_org: targetOrgId, role },
        newState: { role },
        status: 'success',
        durationMs: Date.now() - startTime,
      },
      context
    );

    return NextResponse.json({
      success: true,
      message: 'Access granted successfully',
    });
  } catch (err) {
    logServerError('Grant federated source access failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/federated/access
 *
 * Revoke access from a federated source.
 *
 * Query params:
 * - source_id: string (required)
 * - user_id?: string
 * - organization_id?: string
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  const context = getAuditContext(request);

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);
    const sourceId = url.searchParams.get('source_id');
    const targetUserId = url.searchParams.get('user_id') ?? undefined;
    const targetOrgId = url.searchParams.get('organization_id') ?? undefined;

    if (!sourceId) {
      return NextResponse.json(
        { error: 'source_id is required' },
        { status: 400 }
      );
    }

    if (!targetUserId && !targetOrgId) {
      return NextResponse.json(
        { error: 'Either user_id or organization_id is required' },
        { status: 400 }
      );
    }

    // Check permission (need owner to revoke access)
    const hasAccess = await checkSourcePermission(userId, sourceId, 'owner');
    if (!hasAccess) {
      await logFederatedOperation(
        {
          userId,
          operation: 'access.revoke',
          resourceType: 'access',
          resourceId: sourceId,
          details: { target_user: targetUserId, target_org: targetOrgId },
          status: 'denied',
          errorMessage: 'Insufficient permissions',
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json(
        { error: 'Only source owners can revoke access' },
        { status: 403 }
      );
    }

    const result = await revokeSourceAccess({
      sourceId,
      targetUserId,
      targetOrganizationId: targetOrgId,
    });

    if (!result.success) {
      await logFederatedOperation(
        {
          userId,
          operation: 'access.revoke',
          resourceType: 'access',
          resourceId: sourceId,
          details: { target_user: targetUserId, target_org: targetOrgId },
          status: 'failed',
          errorMessage: result.error,
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Log success
    await logFederatedOperation(
      {
        userId,
        operation: 'access.revoke',
        resourceType: 'access',
        resourceId: sourceId,
        details: { target_user: targetUserId, target_org: targetOrgId },
        status: 'success',
        durationMs: Date.now() - startTime,
      },
      context
    );

    return NextResponse.json({
      success: true,
      message: 'Access revoked successfully',
    });
  } catch (err) {
    logServerError('Revoke federated source access failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
