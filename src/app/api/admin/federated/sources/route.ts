import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { getAuditContext } from '@/lib/audit';
import {
  getAccessibleSources,
  logFederatedOperation,
  checkSourcePermission,
} from '@/lib/summer/admin';
import { encrypt } from '@/lib/winter/crypto';

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
    const organizationId = url.searchParams.get('organization_id') ?? undefined;
    const includeInactive = url.searchParams.get('include_inactive') === 'true';

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
    console.error('List federated sources error:', err);
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
        organization_id: body.organization_id ?? null,
        created_by: userId,
        verification_status: 'pending',
      })
      .select('id, name, provider, capabilities, is_active, created_at')
      .single();

    if (error) {
      await logFederatedOperation(
        {
          userId,
          organizationId: body.organization_id,
          operation: 'source.create',
          resourceType: 'source',
          details: { name: body.name, provider: body.provider },
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
        organizationId: body.organization_id,
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
    console.error('Create federated source error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
