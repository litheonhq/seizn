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

    // 1. Create or update user profile via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userAttrs.email,
      email_confirm: true,
      user_metadata: {
        full_name: userAttrs.displayName || `${userAttrs.firstName || ''} ${userAttrs.lastName || ''}`.trim(),
        sso_provider: 'saml',
        sso_connection_id: activeConnection.id,
        organization_id: org.id,
      },
    });

    // If user already exists, update metadata instead
    let userId: string;
    if (authError?.message?.includes('already been registered')) {
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', userAttrs.email)
        .single();

      if (!existingUser) {
        return NextResponse.redirect(
          new URL(`/login?error=user_lookup_failed`, request.url)
        );
      }
      userId = existingUser.id;

      await supabase
        .from('profiles')
        .update({
          full_name: userAttrs.displayName || `${userAttrs.firstName || ''} ${userAttrs.lastName || ''}`.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } else if (authError) {
      console.error('SSO user creation error:', authError);
      return NextResponse.redirect(
        new URL(`/login?error=user_creation_failed`, request.url)
      );
    } else {
      userId = authData.user.id;
    }

    // Ensure user is a member of the organization
    await supabase.from('organization_members').upsert(
      {
        organization_id: org.id,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,user_id' }
    );

    // 2. Create session via Supabase magic link (generates session tokens)
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userAttrs.email,
      options: {
        redirectTo: relayState || '/dashboard',
      },
    });

    if (sessionError || !sessionData?.properties?.hashed_token) {
      console.error('SSO session creation error:', sessionError);
      return NextResponse.redirect(
        new URL(`/login?error=session_creation_failed`, request.url)
      );
    }

    // 3. Record successful login attempt
    await supabase.from('sso_login_attempts').insert({
      connection_id: activeConnection.id,
      organization_id: org.id,
      user_id: userId,
      response_status: 'success',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || null,
      user_agent: request.headers.get('user-agent'),
    });

    // 4. Create SSO session record for SLO support
    await supabase.from('sso_sessions').upsert(
      {
        connection_id: activeConnection.id,
        user_id: userId,
        organization_id: org.id,
        session_index: result.assertion.authnStatement?.sessionIndex || null,
        name_id: result.assertion.subject?.nameId || userAttrs.email,
        logged_in_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'connection_id,user_id' }
    );

    // Redirect through the auth callback to establish the session
    return NextResponse.redirect(sessionData.properties.action_link);
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
