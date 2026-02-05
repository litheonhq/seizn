/**
 * OIDC Authentication Initiation API
 *
 * GET /api/auth/oidc/[connectionId] - Initiate OIDC login flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import {
  oidcProvider,
  oidcSessionStore,
  validateOIDCConfig,
} from '@/lib/enterprise-auth/oidc-provider';
import type { OIDCConfig } from '@/lib/enterprise-auth/types';

const REDIRECT_COOKIE_NAME = 'oidc_redirect';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  try {
    // Get the SSO connection configuration
    const supabase = createServerClient();
    const { data: connection, error } = await supabase
      .from('sso_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('enabled', true)
      .single();

    if (error || !connection) {
      return NextResponse.json(
        { error: 'SSO connection not found or disabled' },
        { status: 404 }
      );
    }

    // Verify this is an OIDC connection
    const config = connection.config as OIDCConfig;
    if (config.type !== 'oidc') {
      return NextResponse.json(
        { error: 'This connection is not configured for OIDC' },
        { status: 400 }
      );
    }

    // Validate OIDC config
    const validation = validateOIDCConfig(config);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid OIDC configuration: ${validation.errors.join(', ')}` },
        { status: 500 }
      );
    }

    // Generate PKCE, state, and nonce
    const state = oidcProvider.generateState();
    const nonce = oidcProvider.generateNonce();
    const codeVerifier = oidcProvider.generateCodeVerifier();

    // Determine redirect URI
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
    const redirectUri = `${baseUrl}/api/auth/oidc/callback`;

    // Store auth request for callback verification
    await oidcSessionStore.createAuthRequest({
      connectionId,
      state,
      nonce,
      redirectUri,
      codeVerifier,
    });

    // Get the original redirect URL from query params
    const searchParams = request.nextUrl.searchParams;
    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

    // Store callback URL in cookie
    const cookieStore = await cookies();
    cookieStore.set(REDIRECT_COOKIE_NAME, callbackUrl, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    // Generate authorization URL
    const authorizationUrl = await oidcProvider.generateAuthorizationUrl(
      config,
      state,
      nonce,
      redirectUri,
      codeVerifier
    );

    // Redirect to IdP
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error('OIDC initiation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate OIDC login' },
      { status: 500 }
    );
  }
}
