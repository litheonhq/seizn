import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { SSOService } from '@/lib/enterprise';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { getSSOConnections } from '@/lib/sso';

async function resolveAdminOrgId(userId: string, requestedOrgId?: string | null): Promise<string | null> {
  const supabase = createServerClient();

  if (requestedOrgId) {
    const { data } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('organization_id', requestedOrgId)
      .eq('user_id', userId)
      .single();

    if (!data || !['owner', 'admin'].includes(data.role)) return null;
    return data.organization_id;
  }

  // Default: first org where user is owner/admin.
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1);

  const membership = Array.isArray(data) ? data[0] : null;
  return membership?.organization_id || null;
}

/**
 * GET /api/enterprise/sso - Get SSO configuration or providers
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const info = searchParams.get('info');
    const requestedOrgId = searchParams.get('organization_id') || searchParams.get('org_id');

    if (info === 'providers') {
      return NextResponse.json({
        success: true,
        providers: SSOService.getSupportedProviders(),
      });
    }

    const sessionUser = await getRequestUser(request);
    const apiKeyAuth = sessionUser ? null : await validateApiKey(request);

    const userId = sessionUser?.id || apiKeyAuth?.userId || null;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId =
      (apiKeyAuth?.orgId ?? null) ||
      (await resolveAdminOrgId(userId, requestedOrgId));

    if (!orgId) {
      // No admin org found; enterprise UI can render "not configured".
      return NextResponse.json({ success: true, config: null });
    }

    // Fetch SSO connections (real implementation)
    const connections = await getSSOConnections(orgId);
    const primary = connections.find((c) => c.status === 'active') || connections[0] || null;

    return NextResponse.json({
      success: true,
      config: primary
        ? {
            id: primary.id,
            enabled: primary.status === 'active',
            provider: primary.name,
            domains: primary.emailDomains || [],
            defaultRole: primary.settings?.defaultRole || 'member',
          }
        : null,
    });
  } catch (error) {
    console.error('SSO config error:', error);
    return ServerErrors.internal('sso_config');
  }
}

/**
 * POST /api/enterprise/sso - Create or update SSO configuration
 */
export async function POST(_request: NextRequest) {
  try {
    // This endpoint is a dashboard convenience wrapper.
    // Use the organization-scoped SSO APIs for actual configuration:
    // - POST /api/organizations/[orgId]/sso
    // - PATCH /api/organizations/[orgId]/sso/[connectionId]
    return NextResponse.json(
      {
        error: 'Not implemented. Use /api/organizations/[orgId]/sso endpoints.',
      },
      { status: 501 }
    );
  } catch (error) {
    console.error('SSO config error:', error);
    return ServerErrors.internal('sso_config_create');
  }
}

/**
 * DELETE /api/enterprise/sso - Disable SSO
 */
export async function DELETE(_request: NextRequest) {
  try {
    return NextResponse.json(
      {
        error: 'Not implemented. Use /api/organizations/[orgId]/sso endpoints.',
      },
      { status: 501 }
    );
  } catch (error) {
    console.error('SSO disable error:', error);
    return ServerErrors.internal('sso_disable');
  }
}
