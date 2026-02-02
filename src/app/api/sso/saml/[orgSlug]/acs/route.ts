/**
 * SAML Assertion Consumer Service (ACS) Endpoint
 *
 * POST /api/sso/saml/[orgSlug]/acs
 *
 * This endpoint receives the SAML Response from the IdP after authentication.
 * It validates the response, creates/updates the user, and initiates a session.
 *
 * NOTE: Full SAML response processing requires additional packages.
 * This is a placeholder that handles the flow structure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSSOConnections } from '@/lib/sso';
import { parseSAMLResponse, extractUserAttributes } from '@/lib/sso/saml-provider';

interface RouteParams {
  params: Promise<{ orgSlug: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug } = await params;

    // Parse form data from IdP
    const formData = await request.formData();
    const samlResponse = formData.get('SAMLResponse') as string | null;
    const relayState = formData.get('RelayState') as string | null;

    if (!samlResponse) {
      return NextResponse.redirect(
        new URL(`/login?error=missing_saml_response`, request.url)
      );
    }

    const supabase = createServerClient();

    // Get organization by slug
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) {
      return NextResponse.redirect(
        new URL(`/login?error=org_not_found`, request.url)
      );
    }

    // Get active SSO connection
    const connections = await getSSOConnections(org.id);
    const activeConnection = connections.find(
      (c) => c.status === 'active' || c.status === 'testing'
    );

    if (!activeConnection) {
      return NextResponse.redirect(
        new URL(`/login?error=sso_not_configured`, request.url)
      );
    }

    // Parse and validate SAML response
    const result = await parseSAMLResponse(samlResponse, activeConnection);

    if ('error' in result) {
      console.error('SAML validation error:', result.error);

      // Log the attempt
      await supabase.from('sso_login_attempts').insert({
        connection_id: activeConnection.id,
        organization_id: org.id,
        response_status: 'error',
        error_code: result.error.code,
        error_message: result.error.message,
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || null,
        user_agent: request.headers.get('user-agent'),
      });

      // For now, redirect with error since SAML processing is not implemented
      return NextResponse.redirect(
        new URL(
          `/login?error=saml_validation_failed&message=${encodeURIComponent(
            result.error.message
          )}`,
          request.url
        )
      );
    }

    // Extract user attributes from assertion
    const userAttrs = extractUserAttributes(result.assertion, activeConnection);

    // TODO: Create or update user profile
    // TODO: Create NextAuth session
    // TODO: Record successful login attempt
    // TODO: Create SSO session for SLO support

    // Placeholder: Redirect to callback URL or dashboard
    const redirectUrl = relayState || '/dashboard';

    // For now, redirect with a message since actual session creation is not implemented
    return NextResponse.redirect(
      new URL(
        `/login?error=sso_not_implemented&email=${encodeURIComponent(
          userAttrs.email
        )}`,
        request.url
      )
    );
  } catch (error) {
    console.error('SAML ACS error:', error);
    return NextResponse.redirect(
      new URL(`/login?error=internal_error`, request.url)
    );
  }
}

// Also handle GET for IdP-initiated SSO (some IdPs send GET)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { searchParams } = new URL(request.url);
  const samlResponse = searchParams.get('SAMLResponse');

  if (!samlResponse) {
    return NextResponse.redirect(
      new URL(`/login?error=missing_saml_response`, request.url)
    );
  }

  // Convert to FormData and call POST handler
  const formData = new FormData();
  formData.set('SAMLResponse', samlResponse);
  const relayState = searchParams.get('RelayState');
  if (relayState) {
    formData.set('RelayState', relayState);
  }

  // Create a new request with POST method
  const postRequest = new Request(request.url, {
    method: 'POST',
    body: formData,
    headers: request.headers,
  });

  return POST(postRequest as NextRequest, { params });
}
