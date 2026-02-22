/**
 * SSO Connection Management API
 *
 * GET    /api/organizations/[orgId]/sso       - List all SSO connections
 * POST   /api/organizations/[orgId]/sso       - Create new SSO connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { verifyCsrf } from '@/lib/csrf';
import {
  AuthErrors,
  ValidationErrors,
  ServerErrors,
} from '@/lib/api-error';
import {
  getSSOConnections,
  createSSOConnection,
} from '@/lib/sso';
import type { SSOProviderType } from '@/types/sso';

// Check if user is org admin
async function checkOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  return !!(membership && ['owner', 'admin'].includes(membership.role));
}

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/organizations/[orgId]/sso
 * List all SSO connections for an organization
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const user = await getRequestUser(request);

    if (!user) {
      return AuthErrors.unauthorized('SSO connections');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO connections');
    }

    const connections = await getSSOConnections(orgId);

    // Mask sensitive fields for non-admin views
    const safeConnections = connections.map((conn) => ({
      ...conn,
      certificate: conn.certificate ? '[CONFIGURED]' : undefined,
      oidcClientSecret: undefined,
    }));

    return NextResponse.json({
      success: true,
      connections: safeConnections,
      count: connections.length,
    });
  } catch (error) {
    console.error('SSO GET error:', error);
    return ServerErrors.internal('list_sso_connections');
  }
}

/**
 * POST /api/organizations/[orgId]/sso
 * Create a new SSO connection
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    const { orgId } = await params;
    const user = await getRequestUser(request);

    if (!user) {
      return AuthErrors.unauthorized('SSO connections');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO connections');
    }

    const body = await request.json();
    const { name, providerType } = body;

    if (!name || name.trim().length < 2) {
      return ValidationErrors.missingField('name');
    }

    const validProviderTypes: SSOProviderType[] = ['saml', 'oidc'];
    if (providerType && !validProviderTypes.includes(providerType)) {
      return ValidationErrors.invalidValue('providerType', providerType, 'saml or oidc');
    }

    const connection = await createSSOConnection(
      orgId,
      name.trim(),
      providerType || 'saml',
      user.id
    );

    return NextResponse.json({
      success: true,
      connection,
    });
  } catch (error) {
    console.error('SSO POST error:', error);
    return ServerErrors.internal('create_sso_connection');
  }
}
