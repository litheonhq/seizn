/**
 * SSO Domain Verification Detail API
 *
 * POST   /api/organizations/[orgId]/sso/domains/[verificationId]        - Verify domain
 * DELETE /api/organizations/[orgId]/sso/domains/[verificationId]        - Remove domain
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import {
  AuthErrors,
  NotFoundErrors,
  ServerErrors,
  createApiError,
  ErrorCodes,
} from '@/lib/api-error';
import { verifyDomain } from '@/lib/sso';

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
  params: Promise<{ orgId: string; verificationId: string }>;
}

/**
 * POST /api/organizations/[orgId]/sso/domains/[verificationId]
 * Verify a domain ownership
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, verificationId } = await params;
    const user = await getUserFromToken(request);

    if (!user) {
      return AuthErrors.unauthorized('SSO domain verification');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO domain verification');
    }

    // Check verification exists and belongs to org
    const supabase = createServerClient();
    const { data: existing } = await supabase
      .from('sso_domain_verifications')
      .select('*')
      .eq('id', verificationId)
      .eq('organization_id', orgId)
      .single();

    if (!existing) {
      return NotFoundErrors.resource('Domain verification', verificationId);
    }

    // Already verified?
    if (existing.is_verified) {
      return NextResponse.json({
        success: true,
        verification: {
          id: existing.id,
          domain: existing.domain,
          isVerified: true,
          verifiedAt: existing.verified_at,
        },
        message: 'Domain is already verified',
      });
    }

    // Check if expired
    if (new Date(existing.expires_at) < new Date()) {
      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Verification token has expired. Please start a new verification.',
        status: 400,
        details: { expiresAt: existing.expires_at },
      });
    }

    try {
      const verification = await verifyDomain(verificationId);

      return NextResponse.json({
        success: true,
        verification,
        message: 'Domain verified successfully',
      });
    } catch (verifyError) {
      const errorMessage =
        verifyError instanceof Error ? verifyError.message : 'Verification failed';

      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: errorMessage,
        status: 400,
        details: {
          domain: existing.domain,
          method: existing.verification_method,
          token: existing.verification_token,
        },
      });
    }
  } catch (error) {
    console.error('SSO domain verification POST error:', error);
    return ServerErrors.internal('verify_domain');
  }
}

/**
 * DELETE /api/organizations/[orgId]/sso/domains/[verificationId]
 * Remove a domain verification
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, verificationId } = await params;
    const user = await getUserFromToken(request);

    if (!user) {
      return AuthErrors.unauthorized('SSO domain verification');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO domain verification');
    }

    const supabase = createServerClient();

    // Check exists and get domain for response
    const { data: existing } = await supabase
      .from('sso_domain_verifications')
      .select('domain')
      .eq('id', verificationId)
      .eq('organization_id', orgId)
      .single();

    if (!existing) {
      return NotFoundErrors.resource('Domain verification', verificationId);
    }

    const { error } = await supabase
      .from('sso_domain_verifications')
      .delete()
      .eq('id', verificationId)
      .eq('organization_id', orgId);

    if (error) {
      console.error('Failed to delete domain verification:', error);
      return ServerErrors.database('delete_domain_verification');
    }

    return NextResponse.json({
      success: true,
      deleted: verificationId,
      domain: existing.domain,
    });
  } catch (error) {
    console.error('SSO domain DELETE error:', error);
    return ServerErrors.internal('delete_domain_verification');
  }
}
