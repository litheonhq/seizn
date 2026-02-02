/**
 * SSO Connection Detail API
 *
 * GET    /api/organizations/[orgId]/sso/[connectionId]       - Get SSO connection details
 * PATCH  /api/organizations/[orgId]/sso/[connectionId]       - Update SSO connection
 * DELETE /api/organizations/[orgId]/sso/[connectionId]       - Delete SSO connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import {
  AuthErrors,
  ValidationErrors,
  NotFoundErrors,
  ServerErrors,
} from '@/lib/api-error';
import {
  getSSOConnection,
  updateSSOConnection,
  deleteSSOConnection,
} from '@/lib/sso';
import type { SSOConnectionStatus, SSOProviderType } from '@/types/sso';

// Helper to get user from auth header
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Check if user is org admin
async function checkOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  return membership && ['owner', 'admin'].includes(membership.role);
}

interface RouteParams {
  params: Promise<{ orgId: string; connectionId: string }>;
}

/**
 * GET /api/organizations/[orgId]/sso/[connectionId]
 * Get SSO connection details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, connectionId } = await params;
    const user = await getUserFromToken(request);

    if (!user) {
      return AuthErrors.unauthorized('SSO connection');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO connection');
    }

    const connection = await getSSOConnection(connectionId, orgId);

    if (!connection) {
      return NotFoundErrors.resource('SSO connection', connectionId);
    }

    // Return full details for admin (mask certificate for display)
    return NextResponse.json({
      success: true,
      connection: {
        ...connection,
        certificate: connection.certificate
          ? {
              configured: true,
              preview: connection.certificate.substring(0, 100) + '...',
            }
          : null,
      },
    });
  } catch (error) {
    console.error('SSO GET detail error:', error);
    return ServerErrors.internal('get_sso_connection');
  }
}

/**
 * PATCH /api/organizations/[orgId]/sso/[connectionId]
 * Update SSO connection
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, connectionId } = await params;
    const user = await getUserFromToken(request);

    if (!user) {
      return AuthErrors.unauthorized('SSO connection');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO connection');
    }

    const body = await request.json();

    // Validate status if provided
    const validStatuses: SSOConnectionStatus[] = ['draft', 'testing', 'active', 'disabled'];
    if (body.status && !validStatuses.includes(body.status)) {
      return ValidationErrors.invalidValue('status', body.status, validStatuses.join(', '));
    }

    // Validate email domains if provided
    if (body.emailDomains) {
      if (!Array.isArray(body.emailDomains)) {
        return ValidationErrors.invalidField('emailDomains', 'must be an array of strings');
      }
      // Validate domain format
      const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/;
      for (const domain of body.emailDomains) {
        if (typeof domain !== 'string' || !domainRegex.test(domain)) {
          return ValidationErrors.invalidField('emailDomains', `invalid domain: ${domain}`);
        }
      }
    }

    // Validate certificate format if provided
    if (body.certificate) {
      if (!body.certificate.includes('-----BEGIN CERTIFICATE-----')) {
        return ValidationErrors.invalidField(
          'certificate',
          'must be a valid X.509 certificate in PEM format'
        );
      }
    }

    // Validate URL formats
    if (body.ssoUrl && !isValidUrl(body.ssoUrl)) {
      return ValidationErrors.invalidField('ssoUrl', 'must be a valid HTTPS URL');
    }
    if (body.sloUrl && !isValidUrl(body.sloUrl)) {
      return ValidationErrors.invalidField('sloUrl', 'must be a valid HTTPS URL');
    }
    if (body.entityId && !isValidUrl(body.entityId)) {
      return ValidationErrors.invalidField('entityId', 'must be a valid URL');
    }

    const connection = await updateSSOConnection(connectionId, orgId, {
      name: body.name,
      status: body.status,
      entityId: body.entityId,
      ssoUrl: body.ssoUrl,
      sloUrl: body.sloUrl,
      certificate: body.certificate,
      oidcIssuer: body.oidcIssuer,
      oidcClientId: body.oidcClientId,
      oidcClientSecret: body.oidcClientSecret,
      emailDomains: body.emailDomains,
      attributeMapping: body.attributeMapping,
      settings: body.settings,
    });

    return NextResponse.json({
      success: true,
      connection,
    });
  } catch (error) {
    console.error('SSO PATCH error:', error);
    return ServerErrors.internal('update_sso_connection');
  }
}

/**
 * DELETE /api/organizations/[orgId]/sso/[connectionId]
 * Delete SSO connection
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, connectionId } = await params;
    const user = await getUserFromToken(request);

    if (!user) {
      return AuthErrors.unauthorized('SSO connection');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO connection');
    }

    // Check if connection exists
    const connection = await getSSOConnection(connectionId, orgId);
    if (!connection) {
      return NotFoundErrors.resource('SSO connection', connectionId);
    }

    // Warn if connection is active
    if (connection.status === 'active') {
      // In a real implementation, you might want to require confirmation
      console.warn(`Deleting active SSO connection: ${connectionId}`);
    }

    await deleteSSOConnection(connectionId, orgId);

    return NextResponse.json({
      success: true,
      deleted: connectionId,
    });
  } catch (error) {
    console.error('SSO DELETE error:', error);
    return ServerErrors.internal('delete_sso_connection');
  }
}

// ============================================
// Helpers
// ============================================

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
