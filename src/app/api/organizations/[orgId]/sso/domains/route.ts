/**
 * SSO Domain Verification API
 *
 * GET    /api/organizations/[orgId]/sso/domains       - List domain verifications
 * POST   /api/organizations/[orgId]/sso/domains       - Start domain verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { verifyCsrf } from '@/lib/csrf';
import { formatDate } from "@/lib/format-date";
import {
  AuthErrors,
  ValidationErrors,
  ServerErrors,
} from '@/lib/api-error';
import { startDomainVerification } from '@/lib/sso';
import type { SSODomainVerification } from '@/types/sso';

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
 * GET /api/organizations/[orgId]/sso/domains
 * List all domain verifications for an organization
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const user = await getRequestUser(request);

    if (!user) {
      return AuthErrors.unauthorized('SSO domains');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO domains');
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('sso_domain_verifications')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch domain verifications:', error);
      return ServerErrors.database('fetch_domain_verifications');
    }

    const domains: SSODomainVerification[] = (data || []).map((d) => ({
      id: d.id,
      organizationId: d.organization_id,
      domain: d.domain,
      verificationMethod: d.verification_method,
      verificationToken: d.verification_token,
      isVerified: d.is_verified,
      verifiedAt: d.verified_at,
      expiresAt: d.expires_at,
      createdAt: d.created_at,
    }));

    return NextResponse.json({
      success: true,
      domains,
      count: domains.length,
    });
  } catch (error) {
    console.error('SSO domains GET error:', error);
    return ServerErrors.internal('list_sso_domains');
  }
}

/**
 * POST /api/organizations/[orgId]/sso/domains
 * Start domain verification process
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
      return AuthErrors.unauthorized('SSO domains');
    }

    const isAdmin = await checkOrgAdmin(user.id, orgId);
    if (!isAdmin) {
      return AuthErrors.unauthorized('SSO domains');
    }

    const body = await request.json();
    const { domain, method } = body;

    if (!domain || typeof domain !== 'string') {
      return ValidationErrors.missingField('domain');
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/;
    const cleanDomain = domain.toLowerCase().trim();

    if (!domainRegex.test(cleanDomain)) {
      return ValidationErrors.invalidField('domain', 'invalid domain format');
    }

    // Validate method if provided
    const validMethods = ['dns_txt', 'dns_cname', 'meta_tag', 'file'];
    if (method && !validMethods.includes(method)) {
      return ValidationErrors.invalidValue('method', method, validMethods.join(', '));
    }

    const verification = await startDomainVerification(
      orgId,
      cleanDomain,
      method || 'dns_txt'
    );

    // Generate instructions based on method
    const instructions = getVerificationInstructions(verification);

    return NextResponse.json({
      success: true,
      verification,
      instructions,
    });
  } catch (error) {
    console.error('SSO domains POST error:', error);
    return ServerErrors.internal('start_domain_verification');
  }
}

// ============================================
// Helpers
// ============================================

function getVerificationInstructions(verification: SSODomainVerification): string {
  switch (verification.verificationMethod) {
    case 'dns_txt':
      return `Add a TXT record to your DNS settings:

Host/Name: _seizn-verification.${verification.domain}
Type: TXT
Value: ${verification.verificationToken}

The verification token expires on ${formatDate(verification.expiresAt)}.
After adding the record, click "Verify" to complete the process.`;

    case 'dns_cname':
      return `Add a CNAME record to your DNS settings:

Host/Name: _seizn-verification.${verification.domain}
Type: CNAME
Value: verify.seizn.com

Then add the verification token as a TXT record.`;

    case 'meta_tag':
      return `Add the following meta tag to your website's <head> section:

<meta name="seizn-verification" content="${verification.verificationToken}" />

The tag should be accessible at https://${verification.domain}`;

    case 'file':
      return `Create a file at the following location:

https://${verification.domain}/.well-known/seizn-verification.txt

With the content:
${verification.verificationToken}`;

    default:
      return 'Follow your administrator for verification instructions.';
  }
}
