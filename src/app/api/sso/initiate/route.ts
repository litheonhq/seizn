/**
 * SSO Initiation Endpoint
 *
 * POST /api/sso/initiate
 *
 * Initiates the SSO flow by:
 * 1. Looking up SSO connection by email domain
 * 2. Generating SAML AuthnRequest
 * 3. Returning redirect URL to IdP
 */

import { NextRequest, NextResponse } from 'next/server';
import { findSSOConnectionByEmail, getSSOConnection } from '@/lib/sso';
import { generateSAMLRequest } from '@/lib/sso/saml-provider';
import { createServerClient } from '@/lib/supabase';
import { ValidationErrors, NotFoundErrors, ServerErrors, createApiError, ErrorCodes } from '@/lib/api-error';

/**
 * POST /api/sso/initiate
 *
 * Body:
 * - email: User's email address (required for domain-based SSO discovery)
 * - connectionId: Direct SSO connection ID (alternative to email)
 * - relayState: URL to redirect to after successful authentication
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, connectionId, relayState } = body;

    let connection;

    if (connectionId) {
      // Direct connection specified
      connection = await getSSOConnection(connectionId);
    } else if (email) {
      // Find connection by email domain
      if (typeof email !== 'string' || !email.includes('@')) {
        return ValidationErrors.invalidField('email', 'must be a valid email address');
      }

      connection = await findSSOConnectionByEmail(email);

      if (!connection) {
        return createApiError({
          code: ErrorCodes.NOT_FOUND,
          message: 'No SSO connection found for this email domain',
          status: 404,
          details: { domain: email.split('@')[1] },
        });
      }
    } else {
      return ValidationErrors.missingField('email or connectionId');
    }

    if (!connection) {
      return NotFoundErrors.resource('SSO connection', connectionId || 'unknown');
    }

    // Check connection is active
    if (connection.status !== 'active' && connection.status !== 'testing') {
      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'SSO connection is not active',
        status: 400,
        details: { status: connection.status },
      });
    }

    // Check required SAML config
    if (!connection.ssoUrl || !connection.entityId) {
      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'SSO connection is not fully configured',
        status: 400,
        details: {
          missing: [
            !connection.ssoUrl && 'ssoUrl',
            !connection.entityId && 'entityId',
          ].filter(Boolean),
        },
      });
    }

    // Log the initiation
    const supabase = createServerClient();
    const requestId = `_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await supabase.from('sso_login_attempts').insert({
      connection_id: connection.id,
      organization_id: connection.organizationId,
      request_id: requestId,
      relay_state: relayState,
      response_status: 'pending',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0] || null,
      user_agent: request.headers.get('user-agent'),
      email: email || null,
    });

    // Generate SAML AuthnRequest
    try {
      const { redirectUrl, request: samlRequest } = await generateSAMLRequest(
        connection,
        relayState
      );

      return NextResponse.json({
        success: true,
        redirectUrl,
        requestId: samlRequest.id,
        provider: {
          name: connection.name,
          type: connection.providerType,
        },
      });
    } catch (samlError) {
      console.error('SAML request generation error:', samlError);
      return createApiError({
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Failed to generate SSO request',
        status: 500,
        details: {
          error: samlError instanceof Error ? samlError.message : 'Unknown error',
        },
      });
    }
  } catch (error) {
    console.error('SSO initiate error:', error);
    return ServerErrors.internal('sso_initiate');
  }
}

/**
 * GET /api/sso/initiate
 *
 * Query params:
 * - email: User's email for SSO discovery
 * - redirect: URL to return to after authentication
 *
 * This redirects directly to the IdP instead of returning JSON.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const redirect = searchParams.get('redirect') || '/dashboard';

  if (!email) {
    return NextResponse.redirect(
      new URL('/login?error=email_required', request.url)
    );
  }

  const connection = await findSSOConnectionByEmail(email);

  if (!connection) {
    return NextResponse.redirect(
      new URL(
        `/login?error=no_sso&message=${encodeURIComponent(
          'No SSO provider found for your email domain'
        )}`,
        request.url
      )
    );
  }

  if (connection.status !== 'active' && connection.status !== 'testing') {
    return NextResponse.redirect(
      new URL('/login?error=sso_disabled', request.url)
    );
  }

  if (!connection.ssoUrl || !connection.entityId) {
    return NextResponse.redirect(
      new URL('/login?error=sso_not_configured', request.url)
    );
  }

  try {
    const { redirectUrl } = await generateSAMLRequest(connection, redirect);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('SSO redirect error:', error);
    return NextResponse.redirect(
      new URL('/login?error=sso_error', request.url)
    );
  }
}
