import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { getAuditContext } from '@/lib/audit';
import {
  getAccessibleSources,
  logFederatedOperation,
} from '@/lib/summer/admin';
import { hasOrgAccess } from '@/lib/winter/org/organization';
import { encrypt } from '@/lib/winter/crypto';
import { logServerError } from '@/lib/server/logger';

/**
 * GET /api/admin/federated/sources
 *
 * List all federated sources accessible to the user.
 *
 * Query params:
 * - organization_id?: string
 * - include_inactive?: boolean
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);
    const requestedOrganizationId = url.searchParams.get('organization_id')?.trim();
    const organizationId = requestedOrganizationId || undefined;
    const includeInactive = url.searchParams.get('include_inactive') === 'true';

    if (organizationId && !(await hasOrgAccess(organizationId, userId))) {
      return NextResponse.json(
        { error: 'Access denied to this organization' },
        { status: 403 }
      );
    }

    const sources = await getAccessibleSources(userId, organizationId);

    const filtered = includeInactive
      ? sources
      : sources.filter((s) => s.isActive);

    return NextResponse.json({
      success: true,
      sources: filtered.map((s) => ({
        id: s.sourceId,
        name: s.sourceName,
        provider: s.provider,
        role: s.role,
        is_active: s.isActive,
      })),
      total: filtered.length,
    });
  } catch (err) {
    logServerError('List federated sources failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/federated/sources
 *
 * Create a new federated source.
 *
 * Body:
 * {
 *   "name": string,
 *   "provider": "pinecone" | "weaviate" | "azure_ai_search" | "vespa" | "custom",
 *   "config": { ... provider-specific config ... },
 *   "capabilities": { "vector"?: boolean, "keyword"?: boolean, "hybrid"?: boolean },
 *   "organization_id"?: string
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

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'name (string) is required' },
        { status: 400 }
      );
    }

    const validProviders = ['pinecone', 'weaviate', 'azure_ai_search', 'vespa', 'custom'];
    if (!body.provider || !validProviders.includes(body.provider)) {
      return NextResponse.json(
        { error: `provider must be one of: ${validProviders.join(', ')}` },
        { status: 400 }
      );
    }

    if (!body.config || typeof body.config !== 'object') {
      return NextResponse.json(
        { error: 'config (object) is required' },
        { status: 400 }
      );
    }

    let organizationId: string | undefined;
    if (body.organization_id != null) {
      if (typeof body.organization_id !== 'string') {
        return NextResponse.json(
          { error: 'organization_id must be a string' },
          { status: 400 }
        );
      }
      organizationId = body.organization_id.trim() || undefined;
    }

    if (organizationId && !(await hasOrgAccess(organizationId, userId))) {
      return NextResponse.json(
        { error: 'Access denied to this organization' },
        { status: 403 }
      );
    }

    // Encrypt sensitive config
    const encryptedConfig = await encrypt(JSON.stringify(body.config));

    const supabase = createServerClient();

    const { data: source, error } = await supabase
      .from('summer_federated_sources')
      .insert({
        user_id: userId,
        name: body.name,
        provider: body.provider,
        config_encrypted: encryptedConfig,
        capabilities: body.capabilities ?? { vector: true },
        is_active: true,
        organization_id: organizationId ?? null,
        created_by: userId,
        verification_status: 'pending',
      })
      .select('id, name, provider, capabilities, is_active, created_at')
      .single();

    if (error) {
      await logFederatedOperation(
        {
          userId,
          organizationId,
          operation: 'source.create',
          resourceType: 'source',
          details: { name: body.name, provider: body.provider },
          status: 'failed',
          errorMessage: error.message,
          durationMs: Date.now() - startTime,
        },
        context
      );
      return NextResponse.json({ error: 'Failed to create federated source' }, { status: 400 });
    }

    // Log success
    await logFederatedOperation(
      {
        userId,
        organizationId,
        operation: 'source.create',
        resourceType: 'source',
        resourceId: source.id,
        details: { name: body.name, provider: body.provider },
        newState: { id: source.id, name: source.name, provider: source.provider },
        status: 'success',
        durationMs: Date.now() - startTime,
      },
      context
    );

    return NextResponse.json(
      {
        success: true,
        source: {
          id: source.id,
          name: source.name,
          provider: source.provider,
          capabilities: source.capabilities,
          is_active: source.is_active,
          created_at: source.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logServerError('Create federated source failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
