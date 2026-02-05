/**
 * OIDC Callback Handler
 *
 * GET /api/auth/oidc/callback - Handle OIDC callback from IdP
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import {
  oidcProvider,
  oidcSessionStore,
} from '@/lib/enterprise-auth/oidc-provider';
import { logAuditEvent } from '@/lib/enterprise-auth/audit';
import type { OIDCConfig } from '@/lib/enterprise-auth/types';
import { signIn } from '@/lib/auth';

const REDIRECT_COOKIE_NAME = 'oidc_redirect';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Get base URL for redirects
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || '';

  // Handle IdP errors
  if (error) {
    console.error('OIDC error from IdP:', error, errorDescription);
    const errorUrl = new URL('/login', baseUrl);
    errorUrl.searchParams.set('error', 'OIDCCallback');
    errorUrl.searchParams.set('error_description', errorDescription || error);
    return NextResponse.redirect(errorUrl);
  }

  // Validate required parameters
  if (!code || !state) {
    const errorUrl = new URL('/login', baseUrl);
    errorUrl.searchParams.set('error', 'OIDCCallback');
    errorUrl.searchParams.set('error_description', 'Missing code or state parameter');
    return NextResponse.redirect(errorUrl);
  }

  try {
    // Retrieve and validate auth request
    const authRequest = await oidcSessionStore.getAuthRequest(state);
    if (!authRequest) {
      throw new Error('Invalid or expired state parameter');
    }

    // Clean up auth request
    await oidcSessionStore.deleteAuthRequest(state);

    // Get SSO connection configuration
    const supabase = createServerClient();
    const { data: connection, error: connError } = await supabase
      .from('sso_connections')
      .select('*')
      .eq('id', authRequest.connectionId)
      .eq('enabled', true)
      .single();

    if (connError || !connection) {
      throw new Error('SSO connection not found or disabled');
    }

    const config = connection.config as OIDCConfig;

    // Exchange code for tokens
    const tokens = await oidcProvider.exchangeCode(
      config,
      code,
      authRequest.redirectUri,
      authRequest.codeVerifier
    );

    // Parse and validate ID token
    const idTokenClaims = oidcProvider.parseIdToken(tokens.id_token);
    const validation = oidcProvider.validateIdToken(idTokenClaims, config, authRequest.nonce);

    if (!validation.valid) {
      throw new Error(`ID token validation failed: ${validation.errors.join(', ')}`);
    }

    // Get user info
    const userInfo = await oidcProvider.getUserInfo(config, tokens.access_token);

    // Map user profile
    const profile = oidcProvider.mapUserProfile(userInfo, idTokenClaims, config.attributeMapping);

    if (!profile.email) {
      throw new Error('Email not provided by identity provider');
    }

    // Verify email domain matches connection domains
    const emailDomain = profile.email.split('@')[1];
    if (connection.domains && connection.domains.length > 0) {
      if (!connection.domains.includes(emailDomain)) {
        throw new Error(`Email domain ${emailDomain} not allowed for this SSO connection`);
      }
    }

    // Find or create user
    let userId: string;

    // Check if user exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', profile.email)
      .single();

    if (existingProfile) {
      userId = existingProfile.id;

      // Update profile with latest info from IdP
      await supabase
        .from('profiles')
        .update({
          full_name: profile.name,
          avatar_url: profile.picture,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } else {
      // Create new user
      const newUserId = crypto.randomUUID();

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: newUserId,
          email: profile.email,
          full_name: profile.name,
          avatar_url: profile.picture,
          plan: 'free',
        });

      if (insertError) {
        throw new Error(`Failed to create user profile: ${insertError.message}`);
      }

      userId = newUserId;

      // Auto-add user to organization
      await supabase
        .from('organization_members')
        .insert({
          organization_id: connection.organization_id,
          user_id: userId,
          role: 'member',
        });
    }

    // Record SSO session
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    await supabase.from('sso_sessions').insert({
      user_id: userId,
      organization_id: connection.organization_id,
      connection_id: authRequest.connectionId,
      provider: connection.provider,
      idp_session_id: idTokenClaims.sid as string || null,
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    });

    // Log audit event
    await logAuditEvent({
      organizationId: connection.organization_id,
      actorId: userId,
      actorEmail: profile.email,
      actorIpAddress: ipAddress,
      actorUserAgent: userAgent,
      eventCategory: 'sso',
      eventType: 'sso_login',
      action: `OIDC login via ${connection.provider}`,
      success: true,
      metadata: {
        connectionId: authRequest.connectionId,
        provider: connection.provider,
        email: profile.email,
      },
    });

    // Create session token
    // For NextAuth integration, we create a JWT and set it as a cookie
    const sessionToken = await createSessionToken(userId, profile.email, profile.name);

    // Get redirect URL from cookie
    const cookieStore = await cookies();
    const redirectUrl = cookieStore.get(REDIRECT_COOKIE_NAME)?.value || '/dashboard';
    cookieStore.delete(REDIRECT_COOKIE_NAME);

    // Set session cookie and redirect
    const response = NextResponse.redirect(new URL(redirectUrl, baseUrl));

    // Set the session token cookie
    const useSecureCookies = process.env.NODE_ENV === 'production';
    const cookiePrefix = useSecureCookies ? '__Secure-' : '';

    response.cookies.set(`${cookiePrefix}authjs.session-token`, sessionToken, {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return response;
  } catch (err) {
    console.error('OIDC callback error:', err);

    // Log failed login attempt
    try {
      const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      await logAuditEvent({
        organizationId: '', // Unknown at this point
        actorIpAddress: ipAddress,
        actorUserAgent: userAgent,
        eventCategory: 'sso',
        eventType: 'sso_login_failed',
        action: 'OIDC login failed',
        success: false,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        metadata: { state },
      });
    } catch {
      // Ignore audit logging errors
    }

    const errorUrl = new URL('/login', baseUrl);
    errorUrl.searchParams.set('error', 'OIDCCallback');
    errorUrl.searchParams.set('error_description', err instanceof Error ? err.message : 'Authentication failed');
    return NextResponse.redirect(errorUrl);
  }
}

/**
 * Create a session token for the authenticated user
 */
async function createSessionToken(
  userId: string,
  email: string,
  name?: string
): Promise<string> {
  const { SignJWT } = await import('jose');
  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

  const token = await new SignJWT({
    id: userId,
    email,
    name,
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);

  return token;
}
