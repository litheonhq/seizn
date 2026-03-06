import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { getAuditContext } from '@/lib/audit';
import {
  checkSourcePermission,
  getSourceAccessLevel,
  logFederatedOperation,
} from '@/lib/summer/admin';
import { encrypt } from '@/lib/winter/crypto';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/admin/federated/sources/[id]
 *
 * Get details of a specific federated source.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceId } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Check permission
    const hasAccess = await checkSourcePermission(userId, sourceId, 'viewer');
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied to this source' },
        { status: 403 }
      );
    }

    const accessLevel = await getSourceAccessLevel(userId, sourceId);

    const supabase = createServerClient();
    const { data: source, error } = await supabase
      .from('summer_federated_sources')
      .select(`
        id, name, provider, capabilities, is_active,
        organization_id, created_at, updated_at,
        verification_status, last_verified_at
      `)
      .eq('id', sourceId)
      .single();

    if (error || !source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    // Get bindings count
    const { count: bindingsCount } = await supabase
      .from('summer_federated_bindings')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId);

    return NextResponse.json({
      success: true,
      source: {
        id: source.id,
        name: source.name,
        provider: source.provider,
        capabilities: source.capabilities,
        is_active: source.is_active,
        organization_id: source.organization_id,
        verification_status: source.verification_status,
        last_verified_at: source.last_verified_at,
        created_at: source.created_at,
        updated_at: source.updated_at,
        bindings_count: bindingsCount ?? 0,
      },
      access_level: accessLevel,
    });
  } catch (err) {
    logServerError('Get federated source failed', err, { sourceId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/federated/sources/[id]
 *
 * Update a federated source.
 *
 * Body:
 * {
 *   "name"?: string,
 *   "config"?: object (will be encrypted),
 *   "capabilities"?: object,
 *   "is_active"?: boolean
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const context = getAuditContext(request);
  const { id: sourceId } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    // Check permission (need editor or higher)
    const hasAccess = await checkSourcePermission(userId, sourceId, 'editor');
    if (!hasAccess) {
      await logFederatedOperation(
        {
          userId,
          operation: 'source.update',
          resourceType: 'source',
          resourceId: sourceId,
          status: 'denied',
          errorMessage: 'Insufficient permissions',
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json(
        { error: 'Insufficient permissions to edit this source' },
        { status: 403 }
      );
    }

    const supabase = createServerClient();

    // Get current state for audit
    const { data: currentSource } = await supabase
      .from('summer_federated_sources')
      .select('name, capabilities, is_active, organization_id')
      .eq('id', sourceId)
      .single();

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      updates.name = body.name;
    }
    if (body.capabilities !== undefined) {
      updates.capabilities = body.capabilities;
    }
    if (body.is_active !== undefined) {
      updates.is_active = body.is_active;
    }
    if (body.config !== undefined) {
      updates.config_encrypted = await encrypt(JSON.stringify(body.config));
      // Reset verification when config changes
      updates.verification_status = 'pending';
    }

    const { data: updated, error } = await supabase
      .from('summer_federated_sources')
      .update(updates)
      .eq('id', sourceId)
      .select('id, name, provider, capabilities, is_active, updated_at')
      .single();

    if (error) {
      await logFederatedOperation(
        {
          userId,
          operation: 'source.update',
          resourceType: 'source',
          resourceId: sourceId,
          previousState: currentSource ?? undefined,
          status: 'failed',
          errorMessage: error.message,
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log success
    await logFederatedOperation(
      {
        userId,
        organizationId: currentSource?.organization_id,
        operation: 'source.update',
        resourceType: 'source',
        resourceId: sourceId,
        previousState: currentSource ?? undefined,
        newState: { name: updated.name, capabilities: updated.capabilities, is_active: updated.is_active },
        details: { fields_updated: Object.keys(body) },
        status: 'success',
        durationMs: Date.now() - startTime,
      },
      context
    );

    return NextResponse.json({
      success: true,
      source: {
        id: updated.id,
        name: updated.name,
        provider: updated.provider,
        capabilities: updated.capabilities,
        is_active: updated.is_active,
        updated_at: updated.updated_at,
      },
    });
  } catch (err) {
    logServerError('Update federated source failed', err, { sourceId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/federated/sources/[id]
 *
 * Delete a federated source.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const context = getAuditContext(request);
  const { id: sourceId } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Check permission (need owner)
    const hasAccess = await checkSourcePermission(userId, sourceId, 'owner');
    if (!hasAccess) {
      await logFederatedOperation(
        {
          userId,
          operation: 'source.delete',
          resourceType: 'source',
          resourceId: sourceId,
          status: 'denied',
          errorMessage: 'Insufficient permissions',
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json(
        { error: 'Only source owners can delete sources' },
        { status: 403 }
      );
    }

    const supabase = createServerClient();

    // Get current state for audit
    const { data: currentSource } = await supabase
      .from('summer_federated_sources')
      .select('name, provider, organization_id')
      .eq('id', sourceId)
      .single();

    // Delete source (cascades to bindings and access grants)
    const { error } = await supabase
      .from('summer_federated_sources')
      .delete()
      .eq('id', sourceId);

    if (error) {
      await logFederatedOperation(
        {
          userId,
          operation: 'source.delete',
          resourceType: 'source',
          resourceId: sourceId,
          previousState: currentSource ?? undefined,
          status: 'failed',
          errorMessage: error.message,
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log success
    await logFederatedOperation(
      {
        userId,
        organizationId: currentSource?.organization_id,
        operation: 'source.delete',
        resourceType: 'source',
        resourceId: sourceId,
        previousState: currentSource ?? undefined,
        details: { deleted_source: currentSource?.name },
        status: 'success',
        durationMs: Date.now() - startTime,
      },
      context
    );

    return NextResponse.json({
      success: true,
      message: 'Source deleted successfully',
    });
  } catch (err) {
    logServerError('Delete federated source failed', err, { sourceId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
